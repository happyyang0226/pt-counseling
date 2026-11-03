import {createService} from '../lib/code-service.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'지원하지 않는 요청입니다.'});
  if(req.method==='POST'){
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'허용하지 않은 요청입니다.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return res.status(415).json({error:'JSON 요청이 필요합니다.'});
  }
  let b=req.body||{};if(typeof b==='string'){if(b.length>2000)throw Error('큰 요청');b=JSON.parse(b);}if(Buffer.byteLength(JSON.stringify(b))>2000)return res.status(413).json({error:'요청이 너무 깁니다.'});
  const action=new URL(req.url,'http://localhost').searchParams.get('action'),service=createService();
  if(action==='request'&&req.method==='POST')return res.status(200).json(await service.request(b.student_no));
  await service.admin(req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'');
  if(action==='list'&&req.method==='GET')return res.status(200).json(await service.rest('/rest/v1/cs_code_requests?status=eq.pending&select=student_no&limit=100'));
  if(action==='issue'&&req.method==='POST')return res.status(200).json(await service.issue(b.student_no,b.confirmed));
  return res.status(404).json({error:'요청을 찾을 수 없습니다.'});
 }catch(e){return res.status(e.status||500).json({error:e.status?e.message:'요청을 처리하지 못했습니다.'});}
}
