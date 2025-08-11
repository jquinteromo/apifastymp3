const { spawn } = require("child_process");

const videoUrl = process.argv[2];
const formatId = process.argv[3];

const ytdlp = spawn("yt-dlp", [
  "-f",
  formatId,
  "-o",
  "-",
  videoUrl,
]);

const ffmpeg = spawn("ffmpeg", [
  "-i", "pipe:0",
  "-vn",
  "-acodec", "libmp3lame",
  "-ab", "192k",
  "-f", "mp3",
  "pipe:1",
]);

ytdlp.stdout.pipe(ffmpeg.stdin);
ffmpeg.stdout.pipe(process.stdout);

ffmpeg.stderr.on("data", (data) => {
  console.error("[ffmpeg]", data.toString());
});

ytdlp.stderr.on("data", (data) => {
  console.error("[yt-dlp]", data.toString());
});

process.on("SIGINT", () => {
  ytdlp.kill("SIGKILL");
  ffmpeg.kill("SIGKILL");
});
