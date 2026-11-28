'use strict';
// Fixed private voice object in R2. No public bucket URLs, no personal data in logs.
const crypto=require('crypto');
const sec=require('./security');
const cfg=require('./config');
const account=process.env.SNOOPY_R2_ACCOUNT_ID||'';
const bucket=process.env.SNOOPY_R2_BUCKET||'';
const access=process.env.SNOOPY_R2_ACCESS_KEY_ID||'';
const secret=process.env.SNOOPY_R2_SECRET_ACCESS_KEY||'';
const root=process.env.SNOOPY_VOICE_SECRET||'';
const password=process.env.SNOOPY_VOICE_PASSWORD||'';
const admin=process.env.SNOOPY_VOICE_ADMIN_PASSWORD||cfg.ADMIN_PASSWORD||'';
const ready=/^[a-f0-9]{32}$/i.test(account)&&/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)&&!!access&&!!secret&&root.length>=32&&password.length>=20&&admin.length>=20&&password!==admin&&root!==password&&root!==admin;
const object='snoopy-private/voice-v3.enc';
const cookieName='snoopy_private_voice';
const maxBytes=4200000;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const hmac=(k,x)=>crypto.createHmac('sha256',k).update(x).digest();
const same=(a,b)=>crypto.timingSafeEqual(hmac(root,'compare:'+a),hmac(root,'compare:'+b));
const derive=label=>hmac(root,'snoopy-private:'+label);
function send(res,status,body,extra={}){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra});
  res.end(JSON.stringify(body));
}
function issue(){
  const value=String(Math.floor(Date.now()/1000)+30*86400)+'.'+crypto.randomBytes(16).toString('hex');
  return value+'.'+hmac(derive('session'),value).toString('hex');
}
function authorized(req){
  const c=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
  if(!c)return false;
  const value=c.slice(cookieName.length+1),parts=value.split('.');
  if(parts.length!==3||!/^\d{10}$/.test(parts[0])||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{64}$/.test(parts[2])||Number(parts[0])<=Date.now()/1000)return false;
  const sig=hmac(derive('session'),parts[0]+'.'+parts[1]).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(parts[2],'hex'));
}
function cookie(value,age){return cookieName+'='+value+'; Path=/api/private-voice/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age}
async function body(req,limit){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw {status:415,error:'Formato no válido.'};
  const chunks=[];let size=0;
  for await(const c of req){size+=c.length;if(size>limit)throw {status:413,error:'Solicitud demasiado grande.'};chunks.push(c)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw {status:400,error:'JSON inválido.'}}
}
function validateProfile(data){
  if(!data||typeof data.ref!=='string'||data.ref.length>4100000||!/^data:audio\/(?:mpeg|mp3|wav|x-wav|flac|x-flac|ogg|opus|mp4|x-m4a|webm|aac);base64,[A-Za-z0-9+/]+={0,2}$/i.test(data.ref))throw {status:400,error:'Referencia de audio no válida.'};
  const sample=Buffer.from(data.ref.split(',')[1],'base64');
  if(sample.length<100||sample.length>3000000)throw {status:400,error:'La referencia debe pesar menos de 3 MB.'};
  return {ref:data.ref,name:'Voz privada de Snoopy'};
}
function encrypt(data){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',derive('storage'),iv);
  cipher.setAAD(Buffer.from('Snoopy:voice-v3:v1'));
  return Buffer.concat([Buffer.from('SVR1'),iv,cipher.update(JSON.stringify(data),'utf8'),cipher.final(),cipher.getAuthTag()]);
}
function decrypt(bytes){
  if(bytes.length<33||bytes.length>maxBytes||bytes.subarray(0,4).toString()!=='SVR1')throw Error('Invalid encrypted object');
  const decipher=crypto.createDecipheriv('aes-256-gcm',derive('storage'),bytes.subarray(4,16));
  decipher.setAAD(Buffer.from('Snoopy:voice-v3:v1'));decipher.setAuthTag(bytes.subarray(-16));
  return validateProfile(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(16,-16)),decipher.final()]).toString('utf8')));
}
async function r2(method,payload=Buffer.alloc(0)){
  const host=account+'.r2.cloudflarestorage.com',path='/'+bucket+'/'+object;
  const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),digest=hash(payload);
  const signed='host;x-amz-content-sha256;x-amz-date';
  const headers='host:'+host+'\nx-amz-content-sha256:'+digest+'\nx-amz-date:'+date+'\n';
  const canonical=[method,path,'',headers,signed,digest].join('\n');
  const scope=day+'/auto/s3/aws4_request';
  const stringToSign=['AWS4-HMAC-SHA256',date,scope,hash(canonical)].join('\n');
  const signing=hmac(hmac(hmac(hmac('AWS4'+secret,day),'auto'),'s3'),'aws4_request');
  const signature=hmac(signing,stringToSign).toString('hex');
  const r=await fetch('https://'+host+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{'x-amz-date':date,'x-amz-content-sha256':digest,Authorization:'AWS4-HMAC-SHA256 Credential='+access+'/'+scope+', SignedHeaders='+signed+', Signature='+signature,...(method==='PUT'?{'Content-Type':'application/octet-stream'}:{})},
    ...(method==='PUT'?{body:payload}:{})});
  if(r.status===404&&method==='GET'){await r.body?.cancel();return null}
  if(!r.ok){await r.body?.cancel();throw Error('R2 unavailable')}
  if(method!=='GET'){await r.body?.cancel();return true}
  if(Number(r.headers.get('content-length'))>maxBytes){await r.body?.cancel();throw Error('Object too large')}
  const chunks=[];let size=0;for await(const c of r.body){size+=c.length;if(size>maxBytes)throw Error('Object too large');chunks.push(Buffer.from(c))}
  return Buffer.concat(chunks);
}
module.exports=async function privateVoice(req,res,url){
  const p=url.pathname,method=req.method;
  // Restrict to same-origin browser calls, including the read endpoint.
  if(req.headers['x-snoopy-voice']!=='1'||(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin'))return send(res,403,{error:'Solicitud no autorizada.'});
  if(!ready)return send(res,503,{error:'La voz privada de R2 todavía no está configurada en Render.'});
  const ip=sec.ip(req);
  if(!sec.limit('private-voice:'+ip,40,60000))return send(res,429,{error:'Espera un momento antes de reintentar.'});
  try{
    if(p==='/api/private-voice/login'&&method==='POST'){
      if(!sec.limit('private-voice-login:'+ip,6,600000))return send(res,429,{error:'Demasiados intentos. Espera diez minutos.'});
      const b=await body(req,2048);
      if(typeof b.password!=='string'||b.password.length>256||!same(b.password,password))return send(res,401,{error:'Clave privada incorrecta.'});
      return send(res,200,{ok:true},{'Set-Cookie':cookie(issue(),30*86400)});
    }
    if(p==='/api/private-voice/logout'&&method==='POST')return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
    if(p==='/api/private-voice/profile'&&method==='GET'){
      if(!authorized(req))return send(res,401,{error:'Activa el acceso privado a la voz.'});
      const bytes=await r2('GET');
      return bytes?send(res,200,decrypt(bytes)):send(res,404,{error:'Todavía no hay una voz guardada.'});
    }
    if(p==='/api/private-voice/profile'&&(method==='PUT'||method==='DELETE')){
      if(!sec.limit('private-voice-admin:'+ip,6,600000))return send(res,429,{error:'Demasiados intentos de administración. Espera diez minutos.'});
      const b=await body(req,maxBytes);
      if(typeof b.admin!=='string'||b.admin.length>256||!same(b.admin,admin))return send(res,403,{error:'Contraseña de administrador incorrecta.'});
      if(method==='PUT'){
        if(b.consent!==true)return send(res,400,{error:'Confirma la autorización para compartir la voz.'});
        const profile=validateProfile(b);
        await r2('PUT',encrypt(profile));
      }else await r2('DELETE');
      return send(res,200,{ok:true});
    }
    return send(res,404,{error:'No encontrado.'});
  }catch(e){return send(res,e.status||503,{error:e.status?e.error:'No se pudo acceder al perfil privado de R2.'})}
};
