const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre','noviembre','diciembre'];
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm=s=>String(s).trim().toLowerCase();
const cent=v=>Math.round((parseFloat(v)||0)*100);
const soles=c=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(c/100);
const hoy=()=>new Date().toLocaleDateString('en-CA');
const fmtFecha=f=>f.split('-').reverse().join('/');
const DIAS=['dom','lun','mar','mié','jue','vie','sáb'];
const diaFecha=f=>DIAS[new Date(f+'T00:00:00').getDay()]+' '+fmtFecha(f).slice(0,5);
const nombreMes=k=>{const[a,m]=k.split('-');return MESES[m-1]+' '+a};
const limite=()=>{const d=new Date();d.setMonth(d.getMonth()-4);return d.toLocaleDateString('en-CA')};

// Modelo (POO): el dinero siempre va en céntimos. adelantos = [{f:'AAAA-MM-DD', m:céntimos}]
class Carga{
  constructor({id,cliente,fecha,fruta,tachos,flete,adelantos,pagado}){
    Object.assign(this,{id,cliente,fecha,fruta,tachos,flete});
    // Cargas antiguas (sin adelantos): si estaban "pagadas", se toman como pagadas por completo
    this.adelantos=Array.isArray(adelantos)?adelantos.map(a=>({f:a.f,m:a.m})).sort((a,b)=>a.f.localeCompare(b.f)):(pagado?[{f:fecha,m:tachos*flete}]:[]);
  }
  get total(){return this.tachos*this.flete}
  get adelanto(){return this.adelantos.reduce((s,a)=>s+a.m,0)}
  get debe(){return Math.max(0,this.total-this.adelanto)}
  get pagado(){return this.debe===0}
}

// Patrón Repository: único lugar que conoce IndexedDB
class RepoCargas{
  constructor(){
    this.ready=new Promise((ok,err)=>{
      const r=indexedDB.open('cargasDB',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('cargas',{keyPath:'id',autoIncrement:true});
      r.onsuccess=()=>{this.db=r.result;ok()};
      r.onerror=()=>err(r.error);
    });
  }
  async _tx(modo,fn){
    await this.ready;
    return new Promise((ok,err)=>{
      const t=this.db.transaction('cargas',modo);
      const r=fn(t.objectStore('cargas'));
      t.oncomplete=()=>ok(r&&r.result);
      t.onerror=()=>err(t.error);
    });
  }
  todas(){return this._tx('readonly',s=>s.getAll()).then(a=>a.map(x=>new Carga(x)))}
  guardar(c){const o={...c};if(o.id===undefined)delete o.id;return this._tx('readwrite',s=>s.put(o))}
  borrar(id){return this._tx('readwrite',s=>s.delete(id))}
}

const repo=new RepoCargas();
let datos=[],frutasSel=[],vista='nueva',ultimos=[],pend=null,edId=null,edAdel=[];
const visibles=()=>datos.filter(c=>c.fecha>=limite());
const orden=(a,b)=>b.fecha.localeCompare(a.fecha)||b.id-a.id;

function toast(m){const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,2200)}

async function cargar(){datos=await repo.todas();listas()}
function listas(){
  const u=k=>{const m=new Map();datos.forEach(c=>{const t=c[k].trim();if(!m.has(norm(t)))m.set(norm(t),t)});return[...m.values()].sort()};
  $('l-clientes').innerHTML=u('cliente').map(x=>`<option value="${esc(x)}">`).join('');
  $('l-frutas').innerHTML=u('fruta').map(x=>`<option value="${esc(x)}">`).join('');
}

function ir(v){
  vista=v;
  ['nueva','hist','buscar','export'].forEach(x=>$('v-'+x).hidden=x!==v);
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  refrescar();
}
const refrescar=()=>vista==='hist'?hist():vista==='buscar'?buscar():vista==='export'?exportUI():0;

function fila(c){
  const ad=c.adelantos.length?`<div class="mut"><b>${c.adelantos.length} ${c.adelantos.length===1?'adelanto':'adelantos'}:</b>${c.adelantos.map((a,i)=>`<br>${i+1}.º ${soles(a.m)} · ${diaFecha(a.f)}`).join('')}</div>`:'';
  return `<article class="item"><div class="top"><b>${esc(c.cliente)}</b><span class="${c.pagado?'ok':'deb'}">${c.pagado?'Pagado':'Debe '+soles(c.debe)}</span></div>
  <div class="mut">${fmtFecha(c.fecha)} · ${esc(c.fruta)} · ${c.tachos} tachos × ${soles(c.flete)}</div>
  <div class="top"><span>Total <b>${soles(c.total)}</b></span><span>Adelantos <b>${soles(c.adelanto)}</b></span></div>${ad}
  <div class="top" style="margin-top:8px"><span></span><span><button class="mini" data-edit="${c.id}">Editar / adelantos</button><button class="mini peligro" data-del="${c.id}">Borrar</button></span></div></article>`;
}

// Nueva carga
const leer=()=>{
  const cl=$('n-cliente').value.trim(),fr=$('n-fruta').value.trim(),t=parseInt($('n-tachos').value,10);
  if(!cl||!fr||!(t>0)){toast('Completa cliente, fruta y tachos');return null}
  const fecha=$('n-fecha').value||hoy(),flete=cent($('n-flete').value),ad=cent($('n-adel').value);
  if(ad>t*flete){toast('El adelanto no puede ser mayor al total');return null}
  return new Carga({cliente:cl,fecha,fruta:fr,tachos:t,flete,adelantos:ad>0?[{f:fecha,m:ad}]:[]});
};
const totalVivo=()=>{
  const t=(parseInt($('n-tachos').value,10)||0)*cent($('n-flete').value);
  $('n-total').textContent=soles(t);
  $('n-debe').textContent=soles(Math.max(0,t-cent($('n-adel').value)));
};
['n-tachos','n-flete','n-adel'].forEach(i=>$(i).oninput=totalVivo);
$('n-rev').onclick=()=>{
  const c=leer();if(!c)return;
  pend=c;
  $('d-txt').innerHTML=`<b>${esc(c.cliente)}</b><br>${fmtFecha(c.fecha)}<br>${esc(c.fruta)}: ${c.tachos} tachos<br>Flete ${soles(c.flete)} × ${c.tachos}<br>Total: ${soles(c.total)}<br>Adelanto: ${soles(c.adelanto)}<br><b>Debe: ${soles(c.debe)}</b>`;
  $('dlg').showModal();
};
$('d-no').onclick=()=>$('dlg').close();
$('d-ok').onclick=async()=>{
  $('dlg').close();
  await repo.guardar(pend);await cargar();
  ['n-cliente','n-fruta','n-tachos','n-adel'].forEach(i=>$(i).value='');
  totalVivo();toast('Carga guardada');
};

// Editar carga y sus adelantos
function pintarEd(){
  const t=(parseInt($('x-tachos').value,10)||0)*cent($('x-flete').value),p=edAdel.reduce((s,a)=>s+a.m,0);
  const deb=Math.max(0,t-p),lleno=t>0&&deb===0;
  $('x-total').textContent=soles(t);
  $('x-debe').textContent=soles(deb);
  ['x-monto','x-fadel','x-addadel'].forEach(i=>$(i).disabled=lleno);
  $('x-monto').placeholder=lleno?'Pagado':'Máx. '+soles(deb);
  $('x-adel').innerHTML=(lleno?'<p class="ok">Ya está pagado: no se pueden agregar más adelantos.</p>':'')+(edAdel.length
    ?edAdel.map((a,i)=>`<div class="top"><span>${i+1}.º adelanto · ${diaFecha(a.f)} · <b>${soles(a.m)}</b></span><button class="mini peligro" data-xq="${i}">Quitar</button></div>`).join('')+`<div class="mut">${edAdel.length} ${edAdel.length===1?'adelanto':'adelantos'} · total ${soles(p)}</div>`
    :'<p class="mut">Sin adelantos todavía.</p>');
}
function abrirEd(id){
  const c=datos.find(x=>x.id==id);if(!c)return;
  edId=c.id;edAdel=c.adelantos.map(a=>({...a}));
  $('x-cliente').value=c.cliente;$('x-fecha').value=c.fecha;$('x-fruta').value=c.fruta;
  $('x-tachos').value=c.tachos;$('x-flete').value=(c.flete/100).toFixed(2);
  $('x-monto').value='';$('x-fadel').value=hoy();
  pintarEd();$('ed').showModal();
}
['x-tachos','x-flete'].forEach(i=>$(i).oninput=pintarEd);
$('x-addadel').onclick=()=>{
  const m=cent($('x-monto').value);
  if(!(m>0)){toast('Escribe el monto del adelanto');return}
  const t=(parseInt($('x-tachos').value,10)||0)*cent($('x-flete').value),deb=Math.max(0,t-edAdel.reduce((s,a)=>s+a.m,0));
  if(t===0){toast('Escribe primero los tachos');return}
  if(m>deb){toast(deb===0?'Ya está pagado':'Solo debe '+soles(deb));return}
  edAdel.push({f:$('x-fadel').value||hoy(),m});
  edAdel.sort((a,b)=>a.f.localeCompare(b.f));
  $('x-monto').value='';pintarEd();
};
$('x-cancel').onclick=()=>$('ed').close();
$('x-save').onclick=async()=>{
  const cl=$('x-cliente').value.trim(),fr=$('x-fruta').value.trim(),t=parseInt($('x-tachos').value,10),fl=cent($('x-flete').value);
  if(!cl||!fr||!(t>0)){toast('Completa cliente, fruta y tachos');return}
  const m=cent($('x-monto').value); // si escribiste un monto y no tocaste "Agregar", también se guarda
  const adel=[...edAdel,...(m>0?[{f:$('x-fadel').value||hoy(),m}]:[])].sort((a,b)=>a.f.localeCompare(b.f));
  if(adel.reduce((s,a)=>s+a.m,0)>t*fl){toast('Los adelantos superan lo que debe');return}
  await repo.guardar(new Carga({id:edId,cliente:cl,fecha:$('x-fecha').value||hoy(),fruta:fr,tachos:t,flete:fl,adelantos:adel}));
  $('ed').close();await cargar();refrescar();toast('Cambios guardados');
};

// Historial (últimos 4 meses)
function hist(){
  const r=visibles().sort(orden);
  $('h-lista').innerHTML=r.length?`<p class="mut">Últimos 4 meses · ${r.length} ${r.length===1?'carga':'cargas'}</p>`+r.map(fila).join(''):'<p class="mut">Aún no hay cargas. Registra la primera en Nueva.</p>';
}

// Buscar con filtros opcionales
function opcionesMes(){
  const o=[];
  for(let i=0;i<5;i++){const d=new Date(new Date().getFullYear(),new Date().getMonth()-i,1);const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;o.push(`<option value="${k}">${nombreMes(k)}</option>`)}
  o.push('<option value="">Últimos 4 meses (todo)</option>');
  $('b-mes').innerHTML=o.join('');
}
function chips(){$('b-chips').innerHTML=frutasSel.map((f,i)=>`<span class="chip">${esc(f)}<button data-chip="${i}" aria-label="Quitar ${esc(f)}">×</button></span>`).join('')}
function addFruta(){const v=norm($('b-fruta').value);if(v&&!frutasSel.includes(v))frutasSel.push(v);$('b-fruta').value='';chips();buscar()}
function buscar(){
  const q=norm($('b-cliente').value),mes=$('b-mes').value,p=$('b-pago').checked,d=$('b-debe').checked;
  const r=visibles().filter(c=>(!q||norm(c.cliente).includes(q))&&(!mes||c.fecha.startsWith(mes))&&(!frutasSel.length||frutasSel.some(f=>norm(c.fruta).includes(f)))&&(p===d||c.pagado===p)).sort(orden);
  ultimos=r;
  if(!r.length){$('b-res').innerHTML='<p class="mut">Sin resultados con estos filtros.</p>';return}
  const t=r.reduce((a,c)=>({n:a.n+c.tachos,t:a.t+c.total,p:a.p+c.adelanto,k:a.k+c.adelantos.length,d:a.d+c.debe}),{n:0,t:0,p:0,k:0,d:0});
  const g=new Map();
  r.forEach(c=>{const k=norm(c.cliente),x=g.get(k)||{n:c.cliente,t:0,d:0};x.t+=c.tachos;x.d+=c.debe;g.set(k,x)});
  $('b-res').innerHTML=`<div class="resumen"><div class="mut">${r.length} ${r.length===1?'carga':'cargas'} · ${t.n} tachos</div>
  <div>Flete total: <b>${soles(t.t)}</b></div><div>Adelantos: <b>${soles(t.p)}</b> (${t.k} ${t.k===1?'pago':'pagos'})</div><div>Debe: <b class="deb">${soles(t.d)}</b></div>
  ${g.size>1?'<hr>'+[...g.values()].map(x=>`<div class="top"><span>${esc(x.n)} · ${x.t} tachos</span><b>${x.d?'Debe '+soles(x.d):'Al día'}</b></div>`).join(''):''}
  ${t.d?'<button class="btn sec" id="b-todo" type="button" style="margin-top:10px">Registrar pago del saldo de estos resultados</button>':''}</div>`+r.map(fila).join('');
}
$('b-cliente').oninput=buscar;
['b-mes','b-pago','b-debe'].forEach(i=>$(i).onchange=buscar);
$('b-add').onclick=addFruta;
$('b-fruta').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addFruta()}};

// Exportar por mes (incluye meses de más de 4 meses)
function exportUI(){
  const m=new Map();
  datos.forEach(c=>{const k=c.fecha.slice(0,7),x=m.get(k)||{n:0,t:0};x.n++;x.t+=c.total;m.set(k,x)});
  const ks=[...m.keys()].sort().reverse();
  $('e-mes').innerHTML=ks.length?ks.map(k=>`<option value="${k}">${nombreMes(k)} · ${m.get(k).n} ${m.get(k).n===1?'carga':'cargas'} · ${soles(m.get(k).t)}</option>`).join(''):'<option value="">No hay cargas guardadas</option>';
  limpiarInfo();
}
$('e-go').onclick=()=>{
  const k=$('e-mes').value;if(!k){toast('No hay nada que exportar');return}
  const r=datos.filter(c=>c.fecha.startsWith(k)).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.id-b.id);
  const q=v=>`"${String(v).replace(/"/g,'""')}"`,m2=c=>(c/100).toFixed(2);
  const L=['Cliente,Fecha,Fruta,Tachos,Flete por tacho,Total,Adelantos,Debe,Detalle adelantos'];
  r.forEach(c=>L.push([q(c.cliente),q(fmtFecha(c.fecha)),q(c.fruta),c.tachos,m2(c.flete),m2(c.total),m2(c.adelanto),m2(c.debe),q(c.adelantos.map(a=>fmtFecha(a.f)+'='+m2(a.m)).join(' | '))].join(',')));
  const T=r.reduce((a,c)=>({n:a.n+c.tachos,t:a.t+c.total,p:a.p+c.adelanto,d:a.d+c.debe}),{n:0,t:0,p:0,d:0});
  L.push(['"TOTAL DEL MES"','','',T.n,'',m2(T.t),m2(T.p),m2(T.d),''].join(','));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\ufeff'+L.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  a.download=`flete ${nombreMes(k)}.csv`;a.click();
  toast('Archivo descargado');
};

// Importar CSV (agrega a lo existente, sin duplicar). Acepta también los CSV antiguos con peso.
function parseCSV(txt){
  txt=txt.replace(/^\ufeff/,'');
  const l1=txt.split('\n')[0];
  const sep=(l1.match(/;/g)||[]).length>(l1.match(/,/g)||[]).length?';':',';
  const filas=[];let f=[],c='',q=false;
  for(let i=0;i<txt.length;i++){
    const ch=txt[i];
    if(q){if(ch==='"'){if(txt[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}
    else if(ch==='"')q=true;
    else if(ch===sep){f.push(c);c=''}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&txt[i+1]==='\n')i++;f.push(c);c='';filas.push(f);f=[]}
    else c+=ch;
  }
  if(c||f.length){f.push(c);filas.push(f)}
  return filas;
}
function fechaISO(s){
  s=String(s).trim();
  let m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m&&+m[2]>=1&&+m[2]<=12&&+m[1]>=1&&+m[1]<=31)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?s:null;
}
$('i-go').onclick=async()=>{
  const file=$('i-file').files[0];
  if(!file){toast('Elige primero un archivo CSV');return}
  const filas=parseCSV(await file.text());
  const viejo=norm((filas[0]||[]).join(',')).includes('peso');
  const num=v=>parseFloat(String(v).replace(',','.'));
  const clave=c=>[norm(c.cliente),c.fecha,norm(c.fruta),c.tachos,c.flete].join('|');
  const existentes=new Map();
  datos.forEach(c=>existentes.set(clave(c),(existentes.get(clave(c))||0)+1));
  const nuevas=[];let repetidas=0,omitidas=0;
  filas.forEach(r=>{
    const a=norm(r[0]||'');
    if(!a||a==='cliente'||a.startsWith('total')||a==='debe')return;
    const fecha=fechaISO(r[1]||''),tachos=parseInt(r[3],10),flete=Math.round(num(viejo?r[5]:r[4])*100);
    if(!fecha||!(tachos>0)||!norm(r[2]||'')||!(flete>=0)){omitidas++;return}
    let adel=[];
    if(viejo){
      if(['pagó','pago'].includes(norm(r[7]||'')))adel=[{f:fecha,m:tachos*flete}];
    }else{
      (r[8]||'').split('|').forEach(p=>{const[x,y]=p.split('=');const f=fechaISO(x||''),m=Math.round(num(y)*100);if(f&&m>0)adel.push({f,m})});
      if(!adel.length){const m=Math.round(num(r[6])*100);if(m>0)adel=[{f:fecha,m}]}
    }
    const c=new Carga({cliente:r[0].trim(),fecha,fruta:r[2].trim(),tachos,flete,adelantos:adel});
    const k=clave(c);
    if(existentes.get(k)>0){existentes.set(k,existentes.get(k)-1);repetidas++}else nuevas.push(c);
  });
  if(!nuevas.length){alert(`No hay cargas nuevas para agregar.\nYa existían: ${repetidas}\nOmitidas por datos incompletos: ${omitidas}`);return}
  if(!confirm(`Se agregarán ${nuevas.length} cargas nuevas.\nYa existían: ${repetidas}\nOmitidas por datos incompletos: ${omitidas}\n\n¿Continuar?`))return;
  for(const c of nuevas)await repo.guardar(c);
  await cargar();exportUI();$('i-file').value='';toast(`${nuevas.length} cargas importadas`);
};

// Limpiar lo de más de 4 meses
const antiguas=()=>datos.filter(c=>c.fecha<limite());
function limpiarInfo(){
  const a=antiguas();
  $('l-info').textContent=a.length
    ?`Hay ${a.length} ${a.length===1?'carga':'cargas'} de más de 4 meses guardadas (${soles(a.reduce((s,c)=>s+c.total,0))}). Descarga antes su respaldo en CSV.`
    :'No hay cargas de más de 4 meses.';
  $('l-go').disabled=!a.length;
}
$('l-go').onclick=async()=>{
  const a=antiguas();
  if(!a.length)return;
  if(!confirm(`Se borrarán ${a.length} cargas de más de 4 meses. Esto no se puede deshacer.\n\n¿Ya descargaste su respaldo en CSV?`))return;
  for(const c of a)await repo.borrar(c.id);
  await cargar();exportUI();toast('Cargas antiguas borradas');
};

// Acciones en las tarjetas y en la barra
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.v)return ir(b.dataset.v);
  if(b.dataset.chip){frutasSel.splice(+b.dataset.chip,1);chips();return buscar()}
  if(b.dataset.xq){edAdel.splice(+b.dataset.xq,1);return pintarEd()}
  if(b.dataset.edit)return abrirEd(b.dataset.edit);
  if(b.dataset.del){if(confirm('¿Borrar esta carga?')){await repo.borrar(+b.dataset.del);await cargar();refrescar()}return}
  if(b.id==='b-todo'&&confirm(`¿Registrar el pago del saldo (${soles(ultimos.reduce((s,c)=>s+c.debe,0))}) de ${ultimos.filter(c=>c.debe>0).length} cargas?`)){
    for(const c of ultimos)if(c.debe>0){const m=c.debe;c.adelantos.push({f:hoy(),m});await repo.guardar(c)}
    await cargar();buscar();toast('Saldos registrados como pagados');
  }
});

(async()=>{
  $('n-fecha').value=hoy();opcionesMes();
  await cargar();ir('nueva');
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
})();
