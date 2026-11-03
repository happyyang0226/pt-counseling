const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
export const validateNo=no=>{if(typeof no!=='string'||!/^\d{4,12}$/.test(no.trim()))fail('학번은 4~12자리 숫자로 입력해 주세요.');return no.trim();};
export function createService(vars=process.env,fetcher=fetch){
 const url=vars.SUPABASE_URL||'https://egwwmhmftixjmvrtivfm.supabase.co';
 const key=vars.SUPABASE_SERVICE_ROLE_KEY;
 async function rest(path,{method='GET',body,token}={}){
  if(!key)fail('서버의 SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다.',503);
  const response=await fetcher(url+path,{method,headers:{apikey:key,Authorization:'Bearer '+(token||key),'Content-Type':'application/json',Prefer:path.includes('on_conflict=')?'resolution=ignore-duplicates,return=representation':'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>null);if(!response.ok)fail('요청 처리에 실패했습니다. 설정과 학생 명단을 확인해 주세요.',response.status===429?429:502);return data;
 }
 async function admin(token){
  if(!token)fail('교수 로그인이 필요합니다.',401);
  let user;try{user=await rest('/auth/v1/user',{token});}catch{fail('로그인을 확인해 주세요.',401);}
  const rows=await rest('/rest/v1/cs_profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role');
  if(rows[0]?.role!=='admin')fail('교수 권한이 필요합니다.',403);
 }
 return {rest,admin,async request(no){
  no=validateNo(no);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(no));const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  if(await rest('/rest/v1/rpc/cs_code_limit',{method:'POST',body:{p_key:hash}})!==true)fail('요청이 많습니다. 10분 후 다시 시도해 주세요.',429);
  await rest('/rest/v1/rpc/cs_code_request',{method:'POST',body:{p_student_no:no}});
  return {message:'발급 요청을 접수했습니다. 교수님께 본인 확인 후 접속 코드를 전달받아 주세요.'};
 },async issue(no,confirmed){
  no=validateNo(no);if(confirmed!==true)fail('학생 본인 확인에 체크해 주세요.');
  const roster=await rest('/rest/v1/cs_roster?student_no=eq.'+no+'&select=name');if(!roster[0])fail('명단에 등록되지 않은 학번입니다.',404);
  const claimed=await rest('/rest/v1/rpc/cs_code_claim',{method:'POST',body:{p_student_no:no}});if(claimed!==true)fail('이미 발급 중입니다. 잠시 후 다시 시도해 주세요.',409);
  try{
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';const code=Array.from(crypto.getRandomValues(new Uint8Array(18)),n=>alphabet[n%alphabet.length]).join('');
   const profiles=await rest('/rest/v1/cs_profiles?student_no=eq.'+no+'&select=id');
   if(profiles[0])await rest('/auth/v1/admin/users/'+profiles[0].id,{method:'PUT',body:{password:code}});
   else await rest('/auth/v1/admin/users',{method:'POST',body:{email:no+'@students.pt-counsel.app',password:code,email_confirm:true,user_metadata:{app:'counsel',student_no:no},app_metadata:{cs_code_issued:true}}});
   await rest('/rest/v1/cs_code_requests?student_no=eq.'+no,{method:'PATCH',body:{status:'issued'}});return {student_no:no,code};
  }catch(e){try{await rest('/rest/v1/cs_code_requests?student_no=eq.'+no,{method:'PATCH',body:{status:'pending'}});}catch{}throw e;}
 }};
}
