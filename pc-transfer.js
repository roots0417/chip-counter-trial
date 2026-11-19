import {makeWorkbook} from './records.js?v=15';
const DB='chip-counter-pc-transfer-v1',CONFIG='chip-counter-pc-config-v1';
export const recordKey=r=>JSON.stringify([r.sheet,r.model,r.measuredAt,r.total,r.defects,r.actual,r.savedAt||'']);
const empty=()=>({sent:[],pending:null});
export function openTransferDB(){return new Promise((resolve,reject)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>q.result.createObjectStore('receivers');q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result);};q.onerror=()=>reject(q.error);q.onblocked=()=>reject(new Error('다른 앱 창을 닫고 다시 실행하세요.'));});}
export function readTransfer(db,id){return new Promise((resolve,reject)=>{const q=db.transaction('receivers').objectStore('receivers').get(id);q.onsuccess=()=>resolve(q.result||empty());q.onerror=()=>reject(q.error);});}
function mutate(db,id,fn){return new Promise((resolve,reject)=>{const tx=db.transaction('receivers','readwrite'),store=tx.objectStore('receivers'),q=store.get(id);let result,problem;q.onsuccess=()=>{try{const state=q.result||empty();result=fn(state);store.put(state,id);}catch(e){problem=e;tx.abort();}};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(problem||tx.error||new Error('전송 상태를 저장하지 못했습니다.'));tx.onerror=()=>{};});}
function bytes(blob){return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(new Error('전송 파일을 읽지 못했습니다.'));f.readAsArrayBuffer(blob);});}
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export async function prepareTransfer(db,receiverId,records){
 for(let tries=0;tries<5;tries++){
  const state=await readTransfer(db,receiverId);if(state.pending)return state.pending;
  const sent=new Set(state.sent),selected=records.filter(r=>!sent.has(recordKey(r)));if(!selected.length)return null;
  const blob=makeWorkbook(selected);if(blob.size>20*1024*1024)throw new Error('전송 Excel 파일이 20MB를 초과했습니다. Excel 내보내기를 이용해 주세요.');const sha256=hex(await crypto.subtle.digest('SHA-256',await bytes(blob))),id=hex(crypto.getRandomValues(new Uint8Array(16))),keys=selected.map(recordKey);
  const batch={id,sha256,blob,keys,sheets:selected.map(r=>r.sheet),count:selected.length,createdAt:new Date().toISOString()};
  const staged=await mutate(db,receiverId,s=>{if(s.pending)return s.pending;const done=new Set(s.sent);if(keys.some(k=>done.has(k)))return null;s.pending=batch;return batch;});if(staged)return staged;
 }
 throw new Error('다른 창에서 전송 중입니다. 잠시 후 다시 시도하세요.');
}
export async function completeTransfer(db,receiverId,batch,response){
 if(!response?.ok||response.protocol!=='chip-counter-pc-v1'||response.receiverId!==receiverId||response.transferId!==batch.id||response.sha256!==batch.sha256||response.count!==batch.count||typeof response.path!=='string'||!response.path)throw new Error('PC 저장 확인 정보가 맞지 않습니다. 전송 대기 기록을 유지했습니다.');
 return mutate(db,receiverId,s=>{const sent=new Set(s.sent);if(!s.pending){if(batch.keys.every(k=>sent.has(k)))return;throw new Error('전송 대기 상태를 찾지 못했습니다.');}if(s.pending.id!==batch.id)throw new Error('다른 전송이 대기 중입니다.');for(const k of batch.keys)sent.add(k);s.sent=[...sent];s.pending=null;s.last={path:response.path,count:batch.count,at:new Date().toISOString()};});
}
export function setupPCTransfer({getRecords,onChange}){
 const $=id=>document.getElementById(id);let config=null,db=null,busy=false,checking=false,lastRecords=[],state=empty();
 try{config=JSON.parse(localStorage.getItem(CONFIG)||'null');if(config&&(!/^[a-f0-9]{32}$/.test(config.receiverId)||typeof config.address!=='string'||!/^[a-f0-9]{32}$/.test(config.token)))config=null;}catch{}
 const ready=openTransferDB().then(v=>(db=v));ready.catch(e=>message(e.message));
 const native=()=>!!window.chipCounterPC;
 function message(text){$('pcStatus').textContent=text;$('pcInlineStatus').textContent=text;$('pcNoticeText').textContent=text;$('pcNotice').hidden=!text;}
 function buttons(){const pending=state.pending?.count||0,sent=new Set(state.sent),count=lastRecords.filter(r=>!sent.has(recordKey(r))).length;$('pcSend').textContent=busy?'PC 전송 중…':`PC로 전송${pending||count?' '+(pending||count):''}`;$('pcSend').disabled=!native()||!db||busy||checking||!config||!(pending||count);$('pcTestSave').disabled=!native()||busy||checking;$('pcAddress').disabled=busy||checking;$('pcToken').disabled=busy||checking;$('pcConfigClose').disabled=checking;$('pcSummary').textContent=config?`${config.address} · 미전송 ${count}건${pending?' · 재전송 대기 '+pending+'건':''}`:'수신 PC를 먼저 설정하세요.';}
 async function refresh(records){lastRecords=records||lastRecords;await ready;state=config?await readTransfer(db,config.receiverId):empty();buttons();}
 $('pcSettings').onclick=()=>{$('pcAddress').value=config?.address||'';$('pcToken').value=config?.token||'';message(!native()?'PC 직접 전송은 Android APK에서 사용할 수 있습니다. 웹에서는 Excel 내보내기를 이용하세요.':config?'PC 주소와 연결 코드를 변경할 수 있습니다.':'노트북 수신 프로그램 화면의 PC 주소와 연결 코드를 입력하세요.');buttons();$('pcDialog').showModal();};
 $('pcConfigClose').onclick=()=>{if(!checking)$('pcDialog').close();};$('pcDialog').addEventListener('cancel',e=>{if(checking)e.preventDefault();});
 $('pcTestSave').onclick=async()=>{if(checking||busy||!native())return;checking=true;buttons();message('PC 연결을 확인하고 있습니다…');try{await ready;const next={address:$('pcAddress').value.trim(),token:$('pcToken').value.trim().toLowerCase()};const response=await window.chipCounterPC.test(next);if(!response.ok||response.protocol!=='chip-counter-pc-v1'||!/^[a-f0-9]{32}$/.test(response.receiverId))throw new Error('Chip Counter 수신 PC가 아닙니다.');if(config&&config.receiverId!==response.receiverId&&(await readTransfer(db,config.receiverId)).pending)throw new Error('기존 PC에 재전송 대기 기록이 있습니다. 기존 PC 전송을 완료한 뒤 변경하세요.');next.receiverId=response.receiverId;localStorage.setItem(CONFIG,JSON.stringify(next));config=next;await refresh(await getRecords());message(`연결 확인·설정 저장 완료. PC 저장 폴더: ${response.folder}`);await onChange();}catch(e){message(`설정을 저장하지 못했습니다: ${e.message}`);}finally{checking=false;buttons();}};
 $('pcSend').onclick=async()=>{if(busy||checking||!config||!native())return;busy=true;buttons();message('PC 전송 파일을 준비하고 있습니다…');try{await ready;const batch=await prepareTransfer(db,config.receiverId,await getRecords());if(!batch){message('미전송 기록이 없습니다.');return;}message(`${batch.count}건 전송 중입니다. PC의 파일 저장 확인을 기다립니다…`);const response=await window.chipCounterPC.send(batch.blob,config,batch);await completeTransfer(db,config.receiverId,batch,response);message(`PC 저장 완료 · ${batch.count}건 · ${response.path} · MES에서 해당 Excel 파일을 업로드하세요.`);await onChange();}catch(e){message(`PC 전송 미완료: ${e.message} 기록은 유지되며 같은 버튼으로 다시 전송할 수 있습니다.`);}finally{busy=false;try{await refresh(await getRecords());}catch(e){message(`전송 상태를 확인하지 못했습니다: ${e.message}`);}buttons();}};
 $('pcNoticeClose').onclick=()=>{$('pcNotice').hidden=true;};
 buttons();
 return {refresh,get busy(){return busy;},status(record){return config&&new Set(state.sent).has(recordKey(record))?'PC 저장 완료':state.pending?.keys.includes(recordKey(record))?'재전송 대기':'미전송';},async beforeDelete(sheet){await ready;if(busy)throw new Error('PC 전송 중입니다. 전송이 끝난 뒤 삭제하세요.');const states=await new Promise((resolve,reject)=>{const q=db.transaction('receivers').objectStore('receivers').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});if(states.some(s=>s.pending?.sheets.includes(sheet)))throw new Error('재전송 대기 중인 Sheet입니다. PC 전송을 완료한 뒤 삭제하세요.');}};
}
