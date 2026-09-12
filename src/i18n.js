export const languages={en:{name:'English',flag:'🇺🇸'},zh:{name:'中文',flag:'🇨🇳'},ko:{name:'한국어',flag:'🇰🇷'},ja:{name:'日本語',flag:'🇯🇵'},vi:{name:'Tiếng Việt',flag:'🇻🇳'}};
let current='en',dictionary={},observer=null,languageRequest=0,manualChoice=false;
const originals=new WeakMap(),normalize=s=>s.replace(/\s+/g,' ').trim();
const patterns=[
  [/^MATCH (.+)$/,['比赛 $1','경기 $1','試合 $1','TRẬN $1']],
  [/^Match (\d+)$/,['比赛 $1','경기 $1','試合 $1','Trận $1']],
  [/^Round (\d+) \/ 5$/,['第 $1 / 5 轮','$1 / 5 라운드','ラウンド $1 / 5','Vòng $1 / 5']],
  [/^(\S+) rounds completed$/,['已完成 $1 轮','$1라운드 완료','$1ラウンド完了','Đã hoàn thành $1 vòng']],
  [/^(\S+) edges updated$/,['已更新 $1 条连接','$1개 연결 업데이트','$1本の接続を更新','Đã cập nhật $1 kết nối']],
  [/^CIRCUIT (\d+) \/$/,['回路 $1 /','회로 $1 /','回路 $1 /','MẠCH $1 /']],
  [/^(.+) steals\. (.+) hunts\.$/,['$1 偷糖。$2 拦截。','$1의 설탕 훔치기. $2의 추격.','$1が盗む。$2が追う。','$1 trộm đường. $2 truy đuổi.']],
  [/^(.+) picks a route\. (.+) predicts the ambush\.$/,['$1 选择路线，$2 预判并设伏。','$1은 경로를, $2는 매복 위치를 고릅니다.','$1が経路を選び、$2が待ち伏せを予測。','$1 chọn đường. $2 dự đoán để chặn bắt.']],
  [/^(.+) wins · Mica called it\. \+1 point$/,['$1 获胜 · Mica 猜中，+1 分','$1 승리 · Mica 예측 적중, +1점','$1の勝利 · Micaの予想的中、+1点','$1 thắng · Mica đoán đúng, +1 điểm']],
  [/^(.+) wins · Mica missed\. −1 point$/,['$1 获胜 · Mica 猜错，−1 分','$1 승리 · Mica 예측 실패, −1점','$1の勝利 · Micaの予想は外れ、−1点','$1 thắng · Mica đoán sai, −1 điểm']],
  [/^(.+) wins the match\.$/,['$1 赢得本场比赛。','$1, 경기 승리.','$1がこの試合に勝利。','$1 thắng trận này.']],
  [/^(.+) · Roles reverse\. Learned state stays\.$/,['$1 · 交换角色，保留学习状态。','$1 · 역할 교대, 학습 상태 유지.','$1 · 役割交代。学習状態は継続。','$1 · Đổi vai, giữ trạng thái đã học.']],
  [/^Outcome: (.+) wins this round\.$/,['本轮结果：$1 获胜。','결과: $1 라운드 승리.','結果：このラウンドは$1の勝利。','Kết quả: $1 thắng vòng này.']],
  [/^1 virtual point · (.+)$/,['1 虚拟积分 · $1','가상 1점 · $1','仮想ポイント1点 · $1','1 điểm ảo · $1']],
  [/^Shuffled wiring · (.+)$/,['打乱连接 · $1','섞은 연결 · $1','シャッフル接続 · $1','Kết nối xáo trộn · $1']],
  [/^Recorded (.+)$/,['记录于 $1','$1 기록','$1の記録','Ghi nhận lúc $1']],
];
const indices={zh:0,ko:1,ja:2,vi:3};
export function locale(){return current;}
export function translate(value){
  if(current==='en'||!value)return value;const s=normalize(value);if(dictionary[s])return dictionary[s];
  for(const [re,forms]of patterns){const match=s.match(re);if(match){return forms[indices[current]].replace(/\$(\d)/g,(_,i)=>translate(match[+i]));}}
  const inline=s.match(/^Match (\d+) · Round (\d+) of 5 · (.+)$/);if(inline)return `${translate('MATCH '+inline[1])} · ${translate('Round '+inline[2]+' / 5')} · ${translate(inline[3])}`;
  // Long report paragraphs combine independently translated source sentences.
  let out=s;for(const [key,value]of Object.entries(dictionary)){if(key.length>45&&out.includes(key))out=out.replaceAll(key,value);}return out;
}
export function formatDate(value){return new Date(value).toLocaleString({en:'en-US',zh:'zh-CN',ko:'ko-KR',ja:'ja-JP',vi:'vi-VN'}[current]);}
function applyNode(node){
  if(node.nodeType!==Node.TEXT_NODE||!node.parentElement||node.parentElement.closest('script,style,[data-no-i18n]'))return;
  const before=node.data,old=originals.get(node),source=old&&before===old.out?old.source:before;
  if(!source.trim())return;const out=source.replace(source.trim(),translate(source.trim()));originals.set(node,{source,out});if(before!==out)node.data=out;
}
function applyTree(root){if(root.nodeType===Node.TEXT_NODE){applyNode(root);return;}const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode()))applyNode(n);}
function updateMenu(){const button=document.getElementById('language-button');if(button){button.textContent=`${languages[current].flag} ▾`;button.setAttribute('aria-label',`Language: ${languages[current].name}`);}document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.language===current)));}
export async function setLanguage(next,{remember=true}={}){
  const request=++languageRequest;if(remember)manualChoice=true;
  if(!languages[next])next='en';let dict={};if(next!=='en'){const res=await fetch(`/locales/${next}.json`);if(!res.ok)throw new Error('Language unavailable');const raw=await res.json();dict=Object.fromEntries(Object.entries(raw).map(([k,v])=>[normalize(k),v]));}
  if(request!==languageRequest)return;
  current=next;dictionary=dict;document.documentElement.lang=next==='zh'?'zh-CN':next;try{if(remember)localStorage.setItem('fly-arena-language',next);}catch{}
  applyTree(document.getElementById('app'));updateMenu();window.dispatchEvent(new CustomEvent('languagechange',{detail:next}));
}
export function languageMenu(){return `<div class="language-picker" data-no-i18n><button id="language-button" aria-label="Language" aria-haspopup="menu" aria-expanded="false">🇺🇸 ▾</button><div id="language-options" role="menu" hidden>${Object.entries(languages).map(([code,l])=>`<button role="menuitemradio" aria-checked="${code==='en'}" data-language="${code}"><span>${l.flag}</span>${l.name}</button>`).join('')}</div></div>`;}
export async function initLanguage(){
  const button=document.getElementById('language-button'),menu=document.getElementById('language-options');button?.addEventListener('click',()=>{menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));});
  document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',async()=>{try{await setLanguage(b.dataset.language);menu.hidden=true;button.setAttribute('aria-expanded','false');}catch{b.title='Language file unavailable. Please retry.';}}));
  document.addEventListener('click',e=>{if(!e.target.closest('.language-picker')){menu.hidden=true;button?.setAttribute('aria-expanded','false');}});
  observer=new MutationObserver(records=>{observer.disconnect();for(const r of records){if(r.type==='characterData')applyNode(r.target);else for(const n of r.addedNodes)applyTree(n);}observer.observe(document.getElementById('app'),{subtree:true,childList:true,characterData:true});});observer.observe(document.getElementById('app'),{subtree:true,childList:true,characterData:true});
  let saved;try{saved=localStorage.getItem('fly-arena-language');}catch{}if(languages[saved]){await setLanguage(saved,{remember:false});return;}
  const browser=navigator.language.toLowerCase().slice(0,2);let chosen=languages[browser]?browser:'en';try{const data=await fetch('/api/locale').then(r=>r.json());if(languages[data.language])chosen=data.language;}catch{}
  if(manualChoice)return;try{await setLanguage(chosen,{remember:false});}catch{await setLanguage('en',{remember:false});}
}
