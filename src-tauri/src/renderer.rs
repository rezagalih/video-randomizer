use anyhow::{bail, Context, Result};
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::models::*;

pub struct Renderer {
    cancel_flag: Arc<AtomicBool>,
    paused_flag: Arc<AtomicBool>,
    current_child: Arc<Mutex<Option<Child>>>,
    ffmpeg_path: String,
    ffprobe_path: String,
}

impl Renderer {
    pub fn new(ffmpeg_path: String, ffprobe_path: String) -> Self {
        Self {
            cancel_flag: Arc::new(AtomicBool::new(false)),
            paused_flag: Arc::new(AtomicBool::new(false)),
            current_child: Arc::new(Mutex::new(None)),
            ffmpeg_path,
            ffprobe_path,
        }
    }

    pub fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.current_child.lock() {
            if let Some(ref mut child) = *guard {
                let _ = child.kill();
            }
        }
    }

    pub fn toggle_pause(&self) {
        let was_paused = self.paused_flag.load(Ordering::SeqCst);
        self.paused_flag.store(!was_paused, Ordering::SeqCst);
        #[cfg(unix)]
        if let Ok(guard) = self.current_child.lock() {
            if let Some(ref child) = *guard {
                let signal = if was_paused { libc::SIGCONT } else { libc::SIGSTOP };
                unsafe { libc::kill(child.id() as i32, signal); }
            }
        }
        // On Windows, the child process continues running — pause only stops
        // the progress loop on the Rust side from checking further.
        #[cfg(windows)]
        let _ = was_paused;
    }

    pub fn paused(&self) -> bool {
        self.paused_flag.load(Ordering::SeqCst)
    }

    pub fn ffmpeg_path(&self) -> String {
        self.ffmpeg_path.clone()
    }

    pub fn run_render(
        &self,
        music: &[MusicFile],
        sequence: &[SequenceItem],
        settings: &RenderSettings,
        music_order: &[usize],
        progress_cb: impl Fn(RenderProgress),
    ) -> Result<String> {
        self.cancel_flag.store(false, Ordering::SeqCst);
        self.paused_flag.store(false, Ordering::SeqCst);
        let _start = Instant::now();
        let elapsed_progress_cb = {
            let inner = progress_cb;
            move |mut p: RenderProgress| {
                p.elapsed_secs = _start.elapsed().as_secs_f64();
                inner(p);
            }
        };

        let base_target = self.compute_base_target(music, settings);

        (&elapsed_progress_cb)(RenderProgress {
            stage: format!("Building music playlist → target {:.0}s", base_target),
            percent: 0.0, elapsed_secs: 0.0, estimated_remaining_secs: 0.0,
            current_file: String::new(), log_lines: vec![],
        });
        let (music_path, music_dur) = self.build_music_playlist(music, settings, music_order, &elapsed_progress_cb)?;
        (&elapsed_progress_cb)(RenderProgress {
            stage: format!("✓ Music playlist ready ({:.0}s)", music_dur),
            percent: 5.0, elapsed_secs: 0.0, estimated_remaining_secs: 0.0,
            current_file: String::new(), log_lines: vec![],
        });

        // Separate intro from main clips
        let intro_item: Option<&SequenceItem> = sequence.iter().find(|s| s.is_intro);
        let main_sequence: Vec<SequenceItem> = sequence.iter().filter(|s| !s.is_intro).cloned().collect();

        // Trim intro clip if present (lightweight single trim)
        let intro_clip: Option<String> = if let Some(ii) = &intro_item {
            let work = std::env::temp_dir().join("video_randomizer/intro_clip.mp4");
            let out = work.to_string_lossy().to_string();
            (&elapsed_progress_cb)(RenderProgress {
                stage: "Trimming intro video".into(), percent: 5.0, elapsed_secs: 0.0,
                estimated_remaining_secs: 0.0, current_file: ii.filename.clone(), log_lines: vec![],
            });
            self.trim_single(ii, &out, settings)?;
            Some(out)
        } else {
            None
        };

        let fdur = settings.fade_duration;

        if intro_item.is_none() {
            // --- ORIGINAL PATH (no intro): build master, loop as needed, mux ---
            if main_sequence.is_empty() {
                bail!("No clips to render");
            }
            let master = self.build_master_segment(&main_sequence, settings, &elapsed_progress_cb)?;

            self.check_cancel()?;
            (&elapsed_progress_cb)(RenderProgress {
                stage: "✓ Segment created".into(), percent: 50.0, elapsed_secs: 0.0,
                estimated_remaining_secs: 0.0, current_file: String::new(), log_lines: vec![],
            });

            let total_dur: f64 = main_sequence.iter().map(|s| s.duration).sum();
            let actual_master_dur = self.clip_dur(&master).unwrap_or(total_dur);
            let looped = if total_dur < music_dur {
                self.loop_segment(&master, music_dur, actual_master_dur, settings, &elapsed_progress_cb)?
            } else {
                master
            };
            self.check_cancel()?;

            (&elapsed_progress_cb)(RenderProgress {
                stage: "Muxing video & audio → finalizing".into(), percent: 80.0, elapsed_secs: 0.0,
                estimated_remaining_secs: 0.0, current_file: String::new(), log_lines: vec![],
            });
            let final_path = self.mux_video_audio(&looped, &music_path, music_dur, settings, &elapsed_progress_cb)?;

            if settings.delete_cache {
                let _ = std::fs::remove_dir_all(&std::env::temp_dir().join("video_randomizer"));
            }
            (&elapsed_progress_cb)(RenderProgress {
                stage: "Complete".into(), percent: 100.0, elapsed_secs: 0.0,
                estimated_remaining_secs: 0.0, current_file: final_path.clone(), log_lines: vec![],
            });
            return Ok(final_path);
        }

        // --- INTRO PATH: build segment_1 (intro + main, crossfaded), segment_2 (main only), loop seg2, xfade ---
        let main_clips = self.trim_clips(&main_sequence, settings, &elapsed_progress_cb)?;
        let work_dir = std::env::temp_dir().join("video_randomizer");
        std::fs::create_dir_all(&work_dir)?;
        let intro = intro_clip.unwrap();

        // segment_1 = intro + main clips, crossfaded together
        let seg1 = work_dir.join("segment_1.mp4");
        let seg1_s = seg1.to_string_lossy().to_string();
        if !main_clips.is_empty() {
            let mut seg1_clips = vec![intro.clone()];
            seg1_clips.extend(main_clips.iter().cloned());
            self.concat_clips(&seg1_clips, &seg1_s, settings, &elapsed_progress_cb)?;
        } else {
            // No main clips — just rename intro as segment_1
            std::fs::rename(&intro, &seg1_s)?;
        }
        let seg1_dur = self.clip_dur(&seg1_s).unwrap_or(0.0);

        // segment_2 = main clips only, crossfaded together (for looping)
        let seg2 = work_dir.join("segment_2.mp4");
        let seg2_s = seg2.to_string_lossy().to_string();
        let mut seg2_dur = 0.0;
        if main_clips.len() > 1 {
            self.concat_clips(&main_clips, &seg2_s, settings, &elapsed_progress_cb)?;
            seg2_dur = self.clip_dur(&seg2_s).unwrap_or(0.0);
        } else if main_clips.len() == 1 {
            std::fs::rename(&main_clips[0], &seg2_s)?;
            seg2_dur = self.clip_dur(&seg2_s).unwrap_or(0.0);
        }

        self.check_cancel()?;
        (&elapsed_progress_cb)(RenderProgress {
            stage: "✓ Segments created".into(), percent: 50.0, elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0, current_file: String::new(), log_lines: vec![],
        });

        // Loop segment_2 to fill the remaining time after seg1 (with one fdur of overlap)
        let loop_target = if seg2_dur > 0.0 {
            (music_dur - seg1_dur + fdur).max(0.0)
        } else {
            0.0
        };

        let looped = if seg2_dur > 0.0 && main_sequence.iter().map(|s| s.duration).sum::<f64>() < loop_target {
            self.loop_segment(&seg2_s, loop_target, seg2_dur, settings, &elapsed_progress_cb)?
        } else if seg2_dur > 0.0 {
            seg2_s.clone()
        } else {
            String::new()
        };

        self.check_cancel()?;

        // Xfade seg1 into looped (with configured fade duration) or use seg1 alone
        let final_video = if !looped.is_empty() && loop_target > 0.0 {
            self.xfade_two(&seg1_s, &looped, seg1_dur, fdur, settings, &elapsed_progress_cb)?
        } else {
            seg1_s
        };

        (&elapsed_progress_cb)(RenderProgress {
            stage: "Muxing video & audio → finalizing".into(), percent: 80.0, elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0, current_file: String::new(), log_lines: vec![],
        });
        let final_path = self.mux_video_audio(&final_video, &music_path, music_dur, settings, &elapsed_progress_cb)?;

        if settings.delete_cache {
            let _ = std::fs::remove_dir_all(&std::env::temp_dir().join("video_randomizer"));
        }
        (&elapsed_progress_cb)(RenderProgress {
            stage: "Complete".into(), percent: 100.0, elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0, current_file: final_path.clone(), log_lines: vec![],
        });
        Ok(final_path)
    }

    /// Trim a single SequenceItem to an output file.
    fn trim_single(&self, item: &SequenceItem, output: &str, settings: &RenderSettings) -> Result<()> {
        let mut cmd = Command::new(&self.ffmpeg_path);
        cmd.arg("-y")
            .arg("-ss").arg(&item.start_time.to_string())
            .arg("-i").arg(&item.video_path)
            .arg("-t").arg(&item.duration.to_string());
        if settings.mute_source_audio { cmd.arg("-an"); }
        self.vf_opts(&mut cmd, settings);
        self.enc_opts(&mut cmd, settings);
        cmd.arg(output);
        let child = cmd.stdout(Stdio::null()).stderr(Stdio::null()).spawn()
            .context("Failed to spawn ffmpeg for trim")?;
        let _ = child.wait_with_output()?;
        Ok(())
    }

    /// Trim all items in a sequence, return paths to trimmed clips.
    fn trim_clips(
        &self,
        sequence: &[SequenceItem],
        settings: &RenderSettings,
        progress_cb: &impl Fn(RenderProgress),
    ) -> Result<Vec<String>> {
        if sequence.is_empty() {
            return Ok(vec![]);
        }
        let work = std::env::temp_dir().join("video_randomizer");
        std::fs::create_dir_all(&work)?;
        let clips_dir = work.join("clips");
        std::fs::create_dir_all(&clips_dir)?;

        let mut clip_paths = Vec::new();
        let total = sequence.len();
        for (i, item) in sequence.iter().enumerate() {
            self.check_cancel()?;
            self.wait_if_paused()?;
            let cp = clips_dir.join(format!("{:04}.mp4", i));
            let cp_s = cp.to_string_lossy().to_string();
            let pct = (i as f64 / total as f64) * 40.0;
            progress_cb(RenderProgress {
                stage: format!("Trimming clip {}/{}", i + 1, total),
                percent: pct,
                elapsed_secs: 0.0,
                estimated_remaining_secs: 0.0,
                current_file: item.filename.clone(),
                log_lines: vec![],
            });
            self.trim_single(item, &cp_s, settings)?;
            clip_paths.push(cp_s);
        }
        Ok(clip_paths)
    }

    /// Xfade two pre-rendered videos with configured fade duration.
    /// Only re-encodes the ~fdur overlap; the rest uses zero-copy concat demuxer.
    fn xfade_two(
        &self,
        first: &str,
        second: &str,
        first_dur: f64,
        fdur: f64,
        settings: &RenderSettings,
        progress_cb: &impl Fn(RenderProgress),
    ) -> Result<String> {
        let work = std::env::temp_dir().join("video_randomizer");
        let out = work.join("xfade_combined.mp4");
        let out_s = out.to_string_lossy().to_string();

        if fdur <= 0.0 || first_dur <= fdur {
            // No fade or too short: concat-demuxer (zero-copy)
            let list = work.join("xfade_concat.txt");
            let content = format!("file '{}'\nfile '{}'\n", first, second);
            std::fs::write(&list, &content)?;
            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y").arg("-f").arg("concat").arg("-safe").arg("0")
                .arg("-i").arg(&list)
                .arg("-c").arg("copy")
                .arg("-progress").arg("pipe:1").arg(&out_s);
            self.progress_run(cmd, 0.0, "Merging video segments", progress_cb)?;
            return Ok(out_s);
        }

        // Efficient approach: only re-encode the ~fdur overlap.
        // 1. Trim last fdur of first → tail (keyframe-accurate, -c copy)
        // 2. Trim first fdur of second → head (-c copy)
        // 3. Xfade tail + head → xfade_clip (small re-encode, ~fdur seconds)
        // 4. Concat (zero-copy): first[0..first_dur-fdur] + xfade_clip + second[fdur..]

        let tail = work.join("xfade_tail.mp4");
        let tail_s = tail.to_string_lossy().to_string();
        let head = work.join("xfade_head.mp4");
        let head_s = head.to_string_lossy().to_string();
        let cut_start = (first_dur - fdur).max(0.0);

        // Step 1: tail — last fdur of first
        {
            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y").arg("-ss").arg(&cut_start.to_string())
                .arg("-i").arg(first)
                .arg("-t").arg(&fdur.to_string())
                .arg("-c").arg("copy").arg(&tail_s);
            let child = cmd.stdout(Stdio::null()).stderr(Stdio::null()).spawn()
                .context("Failed to spawn ffmpeg for xfade tail")?;
            let _ = child.wait_with_output()?;
        }

        // Step 2: head — first fdur of second
        {
            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y").arg("-ss").arg("0")
                .arg("-i").arg(second)
                .arg("-t").arg(&fdur.to_string())
                .arg("-c").arg("copy").arg(&head_s);
            let child = cmd.stdout(Stdio::null()).stderr(Stdio::null()).spawn()
                .context("Failed to spawn ffmpeg for xfade head")?;
            let _ = child.wait_with_output()?;
        }

        // Step 3: xfade tail + head (small re-encode, ~fdur seconds)
        let xfade_clip = work.join("xfade_clip.mp4");
        let xfade_clip_s = xfade_clip.to_string_lossy().to_string();
        {
            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y").arg("-i").arg(&tail_s).arg("-i").arg(&head_s);
            let filter = format!(
                "xfade=transition=fade:duration={}:offset=0[vout]",
                fdur
            );
            cmd.arg("-filter_complex").arg(&filter).arg("-map").arg("[vout]");
            self.enc_opts(&mut cmd, settings);
            cmd.arg("-progress").arg("pipe:1").arg(&xfade_clip_s);
            self.progress_run(cmd, fdur, "Crossfading intro with main video", progress_cb)?;
        }

        // Step 4: concat first[0..cut_start] + xfade_clip + second[fdur..] (zero-copy)
        {
            let list = work.join("xfade_merge.txt");
            let content = format!(
                "file '{}'\noutpoint {}\nfile '{}'\nfile '{}'\ninpoint {}\n",
                first, cut_start,
                xfade_clip_s,
                second, fdur,
            );
            std::fs::write(&list, &content)?;
            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y").arg("-f").arg("concat").arg("-safe").arg("0")
                .arg("-i").arg(&list)
                .arg("-c").arg("copy")
                .arg("-progress").arg("pipe:1").arg(&out_s);
            self.progress_run(cmd, 0.0, "Merging xfade with full video", progress_cb)?;
        }

        Ok(out_s)
    }

    fn compute_base_target(&self, music: &[MusicFile], settings: &RenderSettings) -> f64 {
        match &settings.duration_mode {
            DurationMode::Fixed(d) => *d,
            DurationMode::FixedCompleteLastSong(d) => {
                let mut acc = 0.0;
                for m in music {
                    acc += m.duration;
                    if acc >= *d {
                        return acc;
                    }
                }
                acc
            }
            DurationMode::SelectedSongs => music.iter().map(|m| m.duration).sum(),
        }
    }

    fn build_music_playlist(
        &self,
        music: &[MusicFile],
        _settings: &RenderSettings,
        order: &[usize],
        progress_cb: &impl Fn(RenderProgress),
    ) -> Result<(String, f64)> {
        progress_cb(RenderProgress {
            stage: "Building music playlist".into(),
            percent: 0.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: String::new(),
            log_lines: vec![],
        });

        let work = std::env::temp_dir().join("video_randomizer");
        std::fs::create_dir_all(&work)?;
        let list_path = work.join("music_playlist.txt");
        let list_str = list_path.to_string_lossy().to_string();

        let mut content = String::new();
        let mut acc = 0.0;

        for &idx in order {
            content.push_str(&format!("file '{}'\n", music[idx].path));
            acc += music[idx].duration;
        }

        std::fs::write(&list_str, &content)?;

        // use actual total if not fixed
        let actual_dur = match &_settings.duration_mode {
            DurationMode::Fixed(d) => *d,
            _ => acc,
        };

        Ok((list_str, actual_dur))
    }

    fn build_master_segment(
        &self,
        sequence: &[SequenceItem],
        settings: &RenderSettings,
        progress_cb: &impl Fn(RenderProgress),
    ) -> Result<String> {
        let work = std::env::temp_dir().join("video_randomizer");
        std::fs::create_dir_all(&work)?;
        let master = work.join("master_segment.mp4");
        let out = master.to_string_lossy().to_string();

        let clips = self.trim_clips(sequence, settings, progress_cb)?;
        if clips.is_empty() {
            bail!("No clips produced");
        }

        if clips.len() == 1 {
            std::fs::rename(&clips[0], &out)?;
        } else {
            self.concat_clips(&clips, &out, settings, progress_cb)?;
        }
        Ok(out)
    }

    fn concat_clips(
        &self,
        clips: &[String],
        output: &str,
        settings: &RenderSettings,
        progress_cb: &impl Fn(RenderProgress),
    ) -> Result<()> {
        let n = clips.len();
        let fdur = settings.fade_duration;

        progress_cb(RenderProgress {
            stage: "Adding crossfade transitions".into(),
            percent: 40.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: String::new(),
            log_lines: vec![],
        });

        if fdur > 0.0 && n > 1 {
            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y");
            for c in clips { cmd.arg("-i").arg(c); }

            let mut filter = String::new();
            let first_dur = self.clip_dur(&clips[0])?.max(fdur + 0.1);
            let mut offset = first_dur - fdur;

            filter.push_str(&format!(
                "[0:v][1:v]xfade=transition=fade:duration={}:offset={}[t1];", fdur, offset
            ));

            for i in 2..n {
                let dur = self.clip_dur(&clips[i - 1])?;
                filter.push_str(&format!(
                    "[t{}][{}:v]xfade=transition=fade:duration={}:offset={}[t{}];",
                    i - 1, i - 1, fdur, offset, i
                ));
                offset += dur - fdur;
            }
            filter.push_str(&format!("[t{}]format=yuv420p[vout]", n - 1));

            cmd.args(["-filter_complex", &filter, "-map", "[vout]"]);
            self.enc_opts(&mut cmd, settings);
            cmd.arg("-progress").arg("pipe:1").arg(output);
            self.progress_run(cmd, 0.0, "Adding crossfade", progress_cb)?;
        } else {
            let concat_list = std::env::temp_dir().join("video_randomizer/concat_list.txt");
            let mut content = String::new();
            for c in clips {
                content.push_str(&format!("file '{}'\n", c));
            }
            std::fs::write(&concat_list, &content)?;

            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y")
                .arg("-f").arg("concat")
                .arg("-safe").arg("0")
                .arg("-i").arg(&concat_list)
                .arg("-c").arg("copy")
                .arg("-progress").arg("pipe:1").arg(output);
            self.progress_run(cmd, 0.0, "Concatenating clips", progress_cb)?;
        }
        Ok(())
    }

    fn loop_segment(
        &self,
        segment: &str,
        target: f64,
        seg_dur: f64,
        settings: &RenderSettings,
        progress_cb: &impl Fn(RenderProgress),
    ) -> Result<String> {
        let work = std::env::temp_dir().join("video_randomizer");
        std::fs::create_dir_all(&work)?;
        let looped = work.join("looped_video.mp4");
        let out = looped.to_string_lossy().to_string();

        let fdur = settings.fade_duration;

        let num = if fdur > 0.0 && seg_dur > fdur {
            // Each xfade consumes `fdur` from total: N*seg_dur - (N-1)*fdur >= target
            ((target - fdur) / (seg_dur - fdur)).ceil() as u64
        } else {
            (target / seg_dur).ceil() as u64
        };

        progress_cb(RenderProgress {
            stage: format!("Looping segment ({}x){}", num,
                if fdur > 0.0 { " with crossfade" } else { "" }),
            percent: 50.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: format!("{} loops", num),
            log_lines: vec![],
        });

        if fdur <= 0.0 || num <= 1 {
            // No fade: use concat demuxer
            let list = work.join("loop_list.txt");
            let mut content = String::new();
            for _ in 0..num {
                content.push_str(&format!("file '{}'\n", segment));
            }
            std::fs::write(&list, &content)?;

            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y")
                .arg("-f").arg("concat")
                .arg("-safe").arg("0")
                .arg("-i").arg(&list)
                .arg("-t").arg(&target.to_string())
                .arg("-c").arg("copy")
                .arg("-progress").arg("pipe:1").arg(&out);
            self.progress_run(cmd, target, "Looping segment", progress_cb)?;
        } else {
            // Crossfade between loops using xfade filter chain
            self.loop_with_xfade(segment, target, num, seg_dur, fdur, settings, progress_cb, &out)?;
        }
        Ok(out)
    }

    fn loop_with_xfade(
        &self,
        segment: &str,
        target: f64,
        num: u64,
        seg_dur: f64,
        fdur: f64,
        settings: &RenderSettings,
        progress_cb: &impl Fn(RenderProgress),
        output: &str,
    ) -> Result<()> {
        // For >200 loops, fall back to concat demuxer (no crossfade) to
        // avoid too many file descriptors.
        if num > 200 {
            let list = std::env::temp_dir().join("video_randomizer/loop_fallback.txt");
            let mut content = String::new();
            for _ in 0..num {
                content.push_str(&format!("file '{}'\n", segment));
            }
            std::fs::write(&list, &content)?;

            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y")
                .arg("-f").arg("concat")
                .arg("-safe").arg("0")
                .arg("-i").arg(&list)
                .arg("-t").arg(&target.to_string())
                .arg("-c").arg("copy")
                .arg("-progress").arg("pipe:1").arg(output);
            return self.progress_run(cmd, target, "Looping (fallback)", progress_cb);
        }

        // Use N `-i` inputs + xfade chain (no split=N, which causes OOM).
        let mut cmd = Command::new(&self.ffmpeg_path);
        cmd.arg("-y");
        for _ in 0..num {
            cmd.arg("-i").arg(segment);
        }

        let mut filter = String::new();
        let mut prev = "0:v".to_string();
        for i in 1..num {
            let offset = (i as f64) * (seg_dur - fdur);
            if i == num - 1 {
                filter.push_str(&format!(
                    "[{}][{}:v]xfade=transition=fade:duration={}:offset={}[vout]",
                    prev, i, fdur, offset
                ));
            } else {
                filter.push_str(&format!(
                    "[{}][{}:v]xfade=transition=fade:duration={}:offset={}[t{}]; ",
                    prev, i, fdur, offset, i
                ));
                prev = format!("t{}", i);
            }
        }

        cmd.arg("-filter_complex").arg(&filter)
            .arg("-map").arg("[vout]")
            .arg("-t").arg(&target.to_string());
        self.enc_opts(&mut cmd, settings);
        cmd.arg("-progress").arg("pipe:1").arg(output);
        self.progress_run(cmd, target, "Looping with crossfade", progress_cb)
    }

    fn mux_video_audio(
        &self,
        video: &str,
        music_list: &str,
        duration: f64,
        settings: &RenderSettings,
        progress_cb: &impl Fn(RenderProgress),
    ) -> Result<String> {
        let out_dir = std::path::Path::new(&settings.output_folder);
        std::fs::create_dir_all(out_dir)?;
        let filename = settings.output_filename.trim();
        let filename = if filename.contains('.') { filename.to_string() } else { format!("{}.mp4", filename) };
        let out = out_dir.join(&filename).to_string_lossy().to_string();

        progress_cb(RenderProgress {
            stage: "Muxing video & audio".into(),
            percent: 80.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: String::new(),
            log_lines: vec![],
        });

        let mut cmd = Command::new(&self.ffmpeg_path);
        cmd.arg("-y")
            .arg("-i").arg(video)
            .arg("-f").arg("concat")
            .arg("-safe").arg("0")
            .arg("-i").arg(music_list);

        let use_watermark = settings.watermark.enabled && !settings.watermark.image_path.is_empty();

        if use_watermark {
            cmd.arg("-i").arg(&settings.watermark.image_path);
        }

        if use_watermark {
            let px = settings.watermark.position_x;
            let py = settings.watermark.position_y;
            let sc = settings.watermark.scale;

            let (vw, vh) = self.probe_video_dims(video).unwrap_or((1920, 1080));
            let (wm_ow, wm_oh) = self.probe_video_dims(&settings.watermark.image_path).unwrap_or((100, 100));

            let wm_w = (vw as f64 * sc / 100.0).round().max(1.0) as i32;
            let wm_h = (wm_w as f64 * wm_oh as f64 / wm_ow as f64).round().max(1.0) as i32;
            let ox = ((vw as f64 - wm_w as f64) * px / 100.0).round() as i32;
            let oy = ((vh as f64 - wm_h as f64) * py / 100.0).round() as i32;

            let filter = format!(
                "[2:v]scale={}:{}[wm];[0:v][wm]overlay={}:{}[vout]",
                wm_w, wm_h, ox, oy
            );

            cmd.arg("-filter_complex").arg(&filter);
            cmd.args(["-map", "[vout]", "-map", "1:a:0"]);
            self.enc_opts(&mut cmd, settings);
        } else {
            cmd.args(["-map", "0:v:0", "-map", "1:a:0"]);
            cmd.arg("-c:v").arg("copy");
        }

        cmd.arg("-c:a").arg("aac").arg("-b:a").arg("192k");
        cmd.arg("-t").arg(&duration.to_string());
        cmd.arg("-progress").arg("pipe:1").arg(&out);
        self.progress_run(cmd, duration, "Muxing video & audio", progress_cb)?;
        Ok(out)
    }

    fn vf_opts(&self, cmd: &mut Command, s: &RenderSettings) {
        let mut filters = Vec::new();
        if let OutputResolution::Custom { width, height } = &s.resolution {
            filters.push(format!("scale={}:{}", width, height));
        }
        if let OutputFps::Custom(f) = &s.fps {
            filters.push(format!("fps={}", f));
        }
        if !filters.is_empty() {
            cmd.arg("-vf").arg(filters.join(","));
        }
    }

    fn enc_opts(&self, cmd: &mut Command, s: &RenderSettings) {
        let is_hardware = matches!(&s.encoder_mode, EncoderMode::Auto | EncoderMode::Hardware);

        #[cfg(target_os = "macos")]
        if is_hardware {
            cmd.args(["-c:v", "h264_videotoolbox", "-b:v", "5M"]);
            return;
        }

        #[cfg(target_os = "windows")]
        if is_hardware {
            cmd.args(["-c:v", "h264_nvenc", "-b:v", "5M"]);
            return;
        }

        let preset = match s.encoding_speed {
            EncodingSpeed::Fast => "ultrafast",
            EncodingSpeed::Balanced => "medium",
            EncodingSpeed::Quality => "veryslow",
        };
        cmd.args(["-c:v", "libx264", "-preset", preset, "-crf", "23"]);
    }

    fn clip_dur(&self, path: &str) -> Result<f64> {
        let out = Command::new(&self.ffprobe_path)
            .args(["-v", "quiet", "-print_format", "json", "-show_format", path])
            .output()?;
        let j: serde_json::Value = serde_json::from_slice(&out.stdout)?;
        Ok(j["format"]["duration"].as_str().and_then(|d| d.parse().ok()).unwrap_or(0.0))
    }

    fn probe_video_dims(&self, path: &str) -> Result<(u32, u32)> {
        let out = Command::new(&self.ffprobe_path)
            .args(["-v", "quiet", "-print_format", "json", "-show_streams", path])
            .output()?;
        let j: serde_json::Value = serde_json::from_slice(&out.stdout)?;
        if let Some(streams) = j["streams"].as_array() {
            for stream in streams {
                if stream["codec_type"] == "video" {
                    let w = stream["width"].as_u64().unwrap_or(0) as u32;
                    let h = stream["height"].as_u64().unwrap_or(0) as u32;
                    if w > 0 && h > 0 {
                        return Ok((w, h));
                    }
                }
            }
        }
        anyhow::bail!("Could not probe video dimensions from {}", path)
    }

    fn check_cancel(&self) -> Result<()> {
        if self.cancel_flag.load(Ordering::SeqCst) {
            bail!("Rendering cancelled");
        }
        Ok(())
    }

    fn wait_if_paused(&self) -> Result<()> {
        while self.paused_flag.load(Ordering::SeqCst) {
            if self.cancel_flag.load(Ordering::SeqCst) {
                bail!("Rendering cancelled");
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        Ok(())
    }

    fn progress_run(
        &self,
        mut cmd: Command,
        expected_dur: f64,
        stage: &str,
        progress_cb: &impl Fn(RenderProgress),
    ) -> Result<()> {
        let child = cmd
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("Failed to spawn ffmpeg")?;

        {
            let mut guard = self.current_child.lock().unwrap();
            *guard = Some(child);
        }

        let stderr = {
            let mut guard = self.current_child.lock().unwrap();
            guard.as_mut().unwrap().stderr.take().unwrap()
        };

        let stdout = {
            let mut guard = self.current_child.lock().unwrap();
            guard.as_mut().unwrap().stdout.take().unwrap()
        };

        // Shared buffer for all stderr lines (for error reporting)
        let err_buf = Arc::new(Mutex::new(Vec::<u8>::new()));
        let err_buf_clone = err_buf.clone();
        // Shared buffer for recent stderr log lines (for live display)
        let log_lines = Arc::new(Mutex::new(VecDeque::<String>::with_capacity(100)));
        let log_lines_clone = log_lines.clone();
        let stderr_handle = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let mut q = log_lines_clone.lock().unwrap();
                    if q.len() >= 100 {
                        q.pop_front();
                    }
                    q.push_back(l.clone());
                    drop(q);
                    buf.extend_from_slice(l.as_bytes());
                    buf.push(b'\n');
                }
            }
            *err_buf_clone.lock().unwrap() = buf;
        });

        let reader = BufReader::new(stdout);
        let start = Instant::now();
        let mut total_dur = expected_dur;

        for line in reader.lines() {
            self.check_cancel()?;
            self.wait_if_paused()?;

            if let Ok(l) = line {
                if l.starts_with("out_time_us=") {
                    if let Ok(us) = l.trim_start_matches("out_time_us=").parse::<f64>() {
                        let secs = us / 1_000_000.0;
                        let elapsed = start.elapsed().as_secs_f64();
                        let (pct, remain) = if total_dur > 0.0 {
                            let p = (secs / total_dur * 100.0).min(99.0);
                            let r = if secs > 0.0 {
                                (elapsed / secs) * (total_dur - secs)
                            } else {
                                0.0
                            };
                            (p, r)
                        } else {
                            (0.0, 0.0)
                        };
                        let recent = log_lines.lock().unwrap().drain(..).collect();
                        progress_cb(RenderProgress {
                            stage: stage.to_string(),
                            percent: pct,
                            elapsed_secs: elapsed,
                            estimated_remaining_secs: remain,
                            current_file: String::new(),
                            log_lines: recent,
                        });
                    }
                } else if l.starts_with("duration=") {
                    total_dur = l.trim_start_matches("duration=").parse().unwrap_or(0.0);
                    if total_dur <= 0.0 {
                        total_dur = expected_dur;
                    }
                }
            }
        }

        let _ = stderr_handle.join();

        let status = {
            let mut guard = self.current_child.lock().unwrap();
            guard.as_mut().unwrap().wait()?
        };

        if !status.success() {
            let guard = err_buf.lock().unwrap();
            let err = String::from_utf8_lossy(&guard);
            bail!("FFmpeg failed:\n{}", err);
        }
        Ok(())
    }
}
