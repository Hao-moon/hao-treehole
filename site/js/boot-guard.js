// 模块加载失败也显示恢复入口，避免首页停留在无反馈的加载画面。
function showBootFailure(error){
  const loading=document.querySelector('#loading');
  if(!loading||loading.hidden||loading.classList.contains('done'))return;
  loading.dataset.error=String(error?.message||error||'resource error');
  document.querySelector('#loading-message').textContent='页面资源未能加载，请刷新重试';
  const retry=document.querySelector('#retry');retry.hidden=false;retry.onclick=()=>location.reload();
}
window.addEventListener('error',e=>showBootFailure(e.error||e.message));
window.addEventListener('unhandledrejection',e=>showBootFailure(e.reason));
