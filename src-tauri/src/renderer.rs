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
        if let Ok(guard) = self.current_child.lock() {
            if let Some(ref child) = *guard {
                let signal = if was_paused { libc::SIGCONT } else { libc::SIGSTOP };
                unsafe { libc::kill(child.id() as i32, signal); }
            }
        }
    }

    pub fn paused(&self) -> bool {
        self.paused_flag.load(Ordering::SeqCst)
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

        let base_target = self.compute_base_target(music, settings);

        progress_cb(RenderProgress {
            stage: format!("Building music playlist → target {:.0}s", base_target),
            percent: 0.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: String::new(),
            log_lines: vec![],
        });
        let (music_path, music_dur) = self.build_music_playlist(music, settings, music_order, &progress_cb)?;
        progress_cb(RenderProgress {
            stage: format!("✓ Music playlist ready ({:.0}s)", music_dur),
            percent: 5.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: String::new(),
            log_lines: vec![],
        });

        progress_cb(RenderProgress {
            stage: format!("Creating {:.0}s segment → ongoing", sequence.iter().map(|s| s.duration).sum::<f64>()),
            percent: 5.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: String::new(),
            log_lines: vec![],
        });
        let master = self.build_master_segment(sequence, settings, &progress_cb)?;
        self.check_cancel()?;
        progress_cb(RenderProgress {
            stage: "✓ Segment created".into(),
            percent: 50.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: String::new(),
            log_lines: vec![],
        });

        let total_video_dur: f64 = sequence.iter().map(|s| s.duration).sum();
        // Probe actual duration to match loop xfade offsets precisely
        let actual_master_dur = self.clip_dur(&master).unwrap_or(total_video_dur);
        let looped = if total_video_dur < music_dur {
            self.loop_segment(&master, music_dur, actual_master_dur, settings, &progress_cb)?
        } else {
            master
        };
        self.check_cancel()?;

        progress_cb(RenderProgress {
            stage: "Muxing video & audio → finalizing".into(),
            percent: 80.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: String::new(),
            log_lines: vec![],
        });
        let final_path = self.mux_video_audio(&looped, &music_path, music_dur, settings, &progress_cb)?;

        if settings.delete_cache {
            let cache = std::env::temp_dir().join("video_randomizer");
            let _ = std::fs::remove_dir_all(&cache);
        }

        progress_cb(RenderProgress {
            stage: "Complete".into(),
            percent: 100.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: final_path.clone(),
            log_lines: vec![],
        });

        Ok(final_path)
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

        progress_cb(RenderProgress {
            stage: "Trimming & building master segment".into(),
            percent: 0.0,
            elapsed_secs: 0.0,
            estimated_remaining_secs: 0.0,
            current_file: String::new(),
            log_lines: vec![],
        });

        if sequence.is_empty() {
            bail!("No clips in sequence");
        }

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

            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y")
                .arg("-ss").arg(&item.start_time.to_string())
                .arg("-i").arg(&item.video_path)
                .arg("-t").arg(&item.duration.to_string());
            if settings.mute_source_audio { cmd.arg("-an"); }
            self.vf_opts(&mut cmd, settings);
            cmd.arg("-c:v").arg("libx264")
                .arg("-preset").arg("ultrafast")
                .arg("-crf").arg("23")
                .arg(&cp_s);

            let child = cmd.stdout(Stdio::null()).stderr(Stdio::null()).spawn()
                .context("Failed to spawn ffmpeg")?;
            let _ = child.wait_with_output()?;
            clip_paths.push(cp_s);
        }

        if clip_paths.is_empty() {
            bail!("No clips produced");
        }

        if clip_paths.len() == 1 {
            std::fs::rename(&clip_paths[0], &out)?;
            return Ok(out);
        }

        self.concat_clips(&clip_paths, &out, settings, progress_cb)?;
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
                .arg("-i").arg(&concat_list);
            self.vf_opts(&mut cmd, settings);
            self.enc_opts(&mut cmd, settings);
            cmd.arg("-progress").arg("pipe:1").arg(output);
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
                .arg("-t").arg(&target.to_string());
            self.vf_opts(&mut cmd, settings);
            self.enc_opts(&mut cmd, settings);
            cmd.arg("-progress").arg("pipe:1").arg(&out);
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
                .arg("-t").arg(&target.to_string());
            self.vf_opts(&mut cmd, settings);
            self.enc_opts(&mut cmd, settings);
            cmd.arg("-progress").arg("pipe:1").arg(output);
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
        let out = out_dir.join(&settings.output_filename).to_string_lossy().to_string();

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
        let preset = match s.encoding_speed {
            EncodingSpeed::Fast => "ultrafast",
            EncodingSpeed::Balanced => "medium",
            EncodingSpeed::Quality => "veryslow",
        };

        let use_hardware = matches!(&s.encoder_mode, EncoderMode::Auto | EncoderMode::Hardware);

        #[cfg(target_os = "macos")]
        if use_hardware {
            cmd.args(["-c:v", "h264_videotoolbox", "-b:v", "5M"]);
            return;
        }

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
