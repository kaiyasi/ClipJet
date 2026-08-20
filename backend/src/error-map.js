'use strict';

// Maps internal DownloadError codes and raw yt-dlp output onto a friendly,
// user-facing Traditional Chinese message.
function friendlyDownloadError(error) {
  if (error.code === 'MISSING_YTDLP') {
    return '找不到 yt-dlp，請先安裝 yt-dlp 並確認它已加入 PATH。';
  }

  if (error.code === 'MISSING_ZIP') {
    return '找不到 zip 打包工具，播放清單需要安裝 zip 才能產生下載檔。';
  }

  if (error.code === 'CANCELED') {
    return '下載已取消。';
  }

  if (error.code === 'MAX_JOB_BYTES') {
    return '下載內容超過伺服器允許的暫存大小。';
  }

  if (error.code === 'DOWNLOAD_TIMEOUT') {
    return '下載工作超過時間限制，請縮小範圍或稍後再試。';
  }

  const details = `${error.message}\n${error.output || ''}`.toLowerCase();

  if (details.includes('ffmpeg') || details.includes('postprocessor')) {
    return '找不到 ffmpeg，或影音轉換失敗。請確認 ffmpeg 已安裝並加入 PATH。';
  }

  if (
    details.includes('private video') ||
    details.includes('sign in to confirm') ||
    details.includes('age-restricted')
  ) {
    return '這部影片無法以目前設定存取，可能是私人、年齡限制或需要登入。';
  }

  if (
    details.includes('video unavailable') ||
    details.includes('not available') ||
    details.includes('this video is not available')
  ) {
    return '影片目前無法取得，可能已下架、受地區限制或連結失效。';
  }

  if (details.includes('requested format is not available')) {
    return '影片沒有符合所選畫質的格式，請改選較低畫質或改用 MP3。';
  }

  return '下載失敗，請確認連結可公開存取後再試。';
}

module.exports = { friendlyDownloadError };
