import {createService} from '../lib/code-service.mjs';
const password=process.env.ADMIN_PASSWORD;if(!password||password.length<10)throw Error('ADMIN_PASSWORD 보안 환경 변수를 설정해 주세요.');
const {rest}=createService();let user;
for(let page=1;page<=100;page++){const data=await rest(`/auth/v1/admin/users?page=${page}&per_page=1000`);user=data.users?.find(u=>u.email==='ptyang@scjc.ac.kr');if(user||!data.users||data.users.length<1000)break;if(page===100)throw Error('관리자 화면에서 계정을 확인해 주세요.');}
if(user)await rest('/auth/v1/admin/users/'+user.id,{method:'PUT',body:{password,email_confirm:true}});
else {const result=await rest('/auth/v1/admin/users',{method:'POST',body:{email:'ptyang@scjc.ac.kr',password,email_confirm:true}});user=result.user||result;}
const rows=await rest('/rest/v1/cs_profiles?id=eq.'+user.id+'&select=id');
if(rows[0])await rest('/rest/v1/cs_profiles?id=eq.'+user.id,{method:'PATCH',body:{role:'admin'}});
else await rest('/rest/v1/cs_profiles',{method:'POST',body:{id:user.id,name:'양 교수',role:'admin'}});
console.log('교수 계정 설정 완료. 비밀번호는 출력하지 않습니다.');
