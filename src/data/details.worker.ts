import { gunzipSync,strFromU8 } from 'fflate'
self.onmessage=(event:MessageEvent<{bytes:ArrayBuffer;id:string}>)=>{
 try{const bytes=new Uint8Array(event.data.bytes); const decoded=bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes):bytes; const data=JSON.parse(strFromU8(decoded))
 const detail=data.candidates[event.data.id]
 self.postMessage({result:detail?{...detail,sourceUrl:data.sourceUrl,updatedAt:data.updatedAt}:null})
 }catch(e){self.postMessage({error:e instanceof Error?e.message:'Formato de extrato não reconhecido.'})}
}
