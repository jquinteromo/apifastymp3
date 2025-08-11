const { default: YtDlpWrap } = require('yt-dlp-wrap');
const ytDlpWrap = new YtDlpWrap();
const fs = require('fs');

async function descargarAudio(url) {
  const outputDir = 'downloads';
  const output = `${outputDir}/%(title)s.%(ext)s`;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
    console.log(' Carpeta downloads creada automáticamente');
  }

  try {
    await ytDlpWrap.exec([
     url,
  '-f', 'bestaudio',
  '-x',
  '--audio-format', 'mp3',
  '--audio-quality', '0',
  '--ffmpeg-location', 'C:\\Users\\Jaider\\ffmpeg\\bin',
  '-o', `${outputDir}/%(title)s.%(ext)s`
    ]);

    return { success: true, path: output };
  } catch (error) {
    console.error(' Error al descargar audio:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

module.exports = descargarAudio;
