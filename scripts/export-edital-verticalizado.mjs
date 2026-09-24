import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const token=process.env.NOTION_TOKEN?.trim();
const apiVersion=process.env.NOTION_VERSION||'2026-03-11';
const dataSourceId='8ffe0436-8013-4a34-97f9-b9f9ed67b6c3';
const sourcePageUrl='https://app.notion.com/p/3d4cf5a2673181ccb624e95c0759c02d';
const outputPath=path.resolve('public/data/seedf-edital.json');
if(!token)throw new Error('NOTION_TOKEN não configurado.');

const plain=items=>(items||[]).map(item=>item.plain_text||item.text?.content||'').join('').trim();
function propValue(prop){
  if(!prop)return '';
  if(prop.type==='title'||prop.title)return plain(prop.title);
  if(prop.type==='rich_text'||prop.rich_text)return plain(prop.rich_text);
  if(prop.type==='select'||prop.select)return prop.select?.name||'';
  if(prop.type==='multi_select'||prop.multi_select)return (prop.multi_select||[]).map(item=>item.name).filter(Boolean);
  if(prop.type==='url'||Object.prototype.hasOwnProperty.call(prop,'url'))return prop.url||'';
  if(prop.type==='checkbox'||Object.prototype.hasOwnProperty.call(prop,'checkbox'))return Boolean(prop.checkbox);
  return '';
}
async function request(cursor=null){
  const body={page_size:100};
  if(cursor)body.start_cursor=cursor;
  const response=await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Notion-Version':apiVersion,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!response.ok)throw new Error(`Notion ${response.status}: ${(await response.text()).slice(0,300)}`);
  return response.json();
}

let cursor=null;
const pages=[];
do{
  const payload=await request(cursor);
  pages.push(...(payload.results||[]));
  cursor=payload.has_more?payload.next_cursor:null;
}while(cursor);

const axes=pages.map(page=>{
  const p=page.properties||{};
  return {
    id:page.id,
    topic:String(propValue(p['Tópico'])||'').trim(),
    subtopic:String(propValue(p['Subtópico / item'])||'').trim(),
    subject:String(propValue(p['Matéria'])||'').trim(),
    cargos:Array.isArray(propValue(p['Cargo-meta']))?propValue(p['Cargo-meta']):[],
    sourceBase:String(propValue(p['Fonte-base'])||'').trim(),
    layer:String(propValue(p['Camada'])||'').trim(),
    priority:String(propValue(p['Prioridade'])||'').trim()||null,
    action:String(propValue(p['Ação'])||'').trim()||null,
    covered:typeof propValue(p['Coberto?'])==='boolean'?propValue(p['Coberto?']):null,
    domainState:String(propValue(p['Estado de domínio'])||'').trim()||null,
    observations:String(propValue(p['Observações'])||'').trim()||null,
    sourceUrl:String(propValue(p['Fonte / referência'])||'').trim(),
    sourceLastEditedAt:page.last_edited_time||null
  };
}).filter(axis=>axis.topic&&axis.subject).sort((a,b)=>a.subject.localeCompare(b.subject,'pt-BR')||a.topic.localeCompare(b.topic,'pt-BR'));

const layers=Object.fromEntries([...axes.reduce((map,axis)=>map.set(axis.layer||'Sem camada',(map.get(axis.layer||'Sem camada')||0)+1),new Map())]);
const subjects=Object.fromEntries([...axes.reduce((map,axis)=>map.set(axis.subject,(map.get(axis.subject)||0)+1),new Map())]);
const snapshot={
  schemaVersion:2,
  competitionId:'seedf',
  title:'SEEDF — Edital Projetado + Cargos-meta',
  version:'v0.2',
  kind:'projected',
  generatedAt:new Date().toISOString(),
  source:{
    type:'notion',
    dataSourceId,
    pageUrl:sourcePageUrl,
    apiVersion
  },
  editorialPolicy:{
    official:false,
    note:'Edital projetado pré-edital. Base histórica, atualização obrigatória e radar provável permanecem identificados separadamente.'
  },
  axisCount:axes.length,
  layers,
  subjects,
  axes
};

await mkdir(path.dirname(outputPath),{recursive:true});
const previousSnapshot=await readPreviousSnapshot(outputPath);
if(previousSnapshot?.generatedAt&&snapshotContent(previousSnapshot)===snapshotContent(snapshot)){
  snapshot.generatedAt=previousSnapshot.generatedAt;
}
await writeFile(outputPath,JSON.stringify(snapshot,null,2)+'\n','utf8');
console.log(`Edital SEEDF sanitizado: ${axes.length} eixos exportados para ${outputPath}.`);

async function readPreviousSnapshot(filePath){
  try{return JSON.parse(await readFile(filePath,'utf8'));}
  catch(error){
    if(error?.code==='ENOENT')return null;
    throw error;
  }
}
function snapshotContent(value){
  return JSON.stringify(value,(key,nested)=>key==='generatedAt'?undefined:nested);
}
