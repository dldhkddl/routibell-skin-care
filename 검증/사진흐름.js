import '../화면/글꼴.css';
import '../화면/스타일.css';
import '../화면/피부계획.css';
import '../화면/사진분석.css';
import { EMPTY, validateData } from '../화면/계산.js';
import { createSkinUI } from '../화면/피부계획.js';

const key = 'beautylog-photo-ui-test';
let data = validateData(JSON.parse(localStorage.getItem(key) ?? JSON.stringify(EMPTY())));
const toast = message => { document.getElementById('fixture-message').textContent = message; };
const ui = createSkinUI({
  state: () => ({data,effective:data,demo:false,busy:false,storageError:false}),
  toast,
  navigate: () => render(),
  advanced: () => '',
  dialog: () => toast('검증 화면에서는 이 대화상자를 열지 않습니다.'),
  photoConnection: async()=>({path:'/api/youcam'}),
  photoFetch: async address => {
    if(address.endsWith('/status'))return Response.json({accountScoped:true,analysisEnabled:true,analysisUsed:false,localToken:'isolated-fixture-only',access:{maxActions:4}});
    if(address.endsWith('/analysis/result'))return Response.json({used:false,job:null});
    throw Error('격리 검증 화면은 실제 사진·비용을 전송하지 않습니다.');
  },
  persist: async (next, message) => {
    try { const validated=validateData(next);localStorage.setItem(key,JSON.stringify(validated));data=validated;render();toast(message);return true; }
    catch { toast('검증 기록 저장에 실패했습니다.');return false; }
  },
});
function render() { document.getElementById('fixture-screen').innerHTML = ui.render(); }
document.getElementById('fixture-reset').addEventListener('click', () => {localStorage.removeItem(key);data=EMPTY();render();toast('격리 검증 기록만 지웠습니다.');});
render();
