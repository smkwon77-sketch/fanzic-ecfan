"""브라우저에서 만든 고화질 중간본(master.mp4)을 x264로 최종 인코딩 → 글씨 가장자리가 깨끗하게.
usage: python tools/video/encode.py <master.mp4> <out.mp4> [crf=19] [maxrate=4M]
ffmpeg는 imageio-ffmpeg 패키지에 들어 있는 것을 씀 (pip install imageio-ffmpeg)."""
import os, subprocess, sys
import imageio_ffmpeg

src, dst = sys.argv[1], sys.argv[2]
crf = sys.argv[3] if len(sys.argv) > 3 else "19"
maxrate = sys.argv[4] if len(sys.argv) > 4 else "4M"  # 연무처럼 압축이 어려운 화면은 이 상한이 용량을 결정함
bufsize = f"{float(maxrate.rstrip('M')) * 2:g}M"
cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error", "-i", src,
       "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", crf,
       "-maxrate", maxrate, "-bufsize", bufsize, "-g", "60", "-profile:v", "high", "-pix_fmt", "yuv420p",
       "-movflags", "+faststart", "-an", dst]
subprocess.run(cmd, check=True)
print(f"{dst}  {os.path.getsize(dst) / 1e6:.1f} MB  (crf {crf}, maxrate {maxrate})")
