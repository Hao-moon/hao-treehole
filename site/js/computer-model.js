import {ghostWorld,worldAssetRoot} from './world-theme.js';
export const WALLPAPER_LIMIT = 12 * 1024 * 1024;
export const SCREEN_THEMES = [
  {id:'ghostblade',name:'午后窗影',subtitle:'SUNLIGHT / AFTERNOON',imageUrl:worldAssetRoot+'daylight-screen.png',builtin:true},
  {id:'eva02',name:'ORBIT / 绯红',subtitle:'RED SIGNAL · 02',imageUrl:'/assets/screens/orbit-wallpaper.png',builtin:true},
  {id:'kurisu',name:'山海来信',subtitle:'LAB MEM / 004',imageUrl:'/assets/screens/hills-wallpaper.png',builtin:true},
  {id:'persona',name:'绯红夜航',subtitle:'AFTER HOURS / TAKE YOUR TIME',imageUrl:'/assets/screens/night-wallpaper.png',builtin:true},
];
export function validateWallpaper(file) {
  if(!file || !['image/png','image/jpeg','image/webp','image/avif'].includes(file.type)) throw new Error('请选择 PNG、JPG、WebP 或 AVIF 图片');
  if(!Number.isFinite(file.size)||file.size<=0) throw new Error('这张图片是空的');
  if(file.size>WALLPAPER_LIMIT) throw new Error('请选择 12 MB 以内的图片');
  return file;
}
export function normalisePreferences(value={}) {
  const number=(n,fallback)=>Number.isFinite(Number(n))?Math.max(0,Math.min(100,Number(n))):fallback;
  return {fit:value.fit==='contain'?'contain':'cover',focalX:number(value.focalX,50),focalY:number(value.focalY,50),rotation:!!value.rotation,interval:[30,60,300].includes(Number(value.interval))?Number(value.interval):60};
}
export function nextWallpaper(themes,current){
  if(!themes.length)return null;
  const index=Math.max(0,themes.findIndex(theme=>theme.id===current));
  return themes[(index+1)%themes.length].id;
}
