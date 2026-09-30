
const diseases = window.PIG_DISEASES || [];
const pigImages = window.PIG_IMAGES || [];
const taiwanPractice = window.TAIWAN_PRACTICE || {profiles:{},general:{},local_authority:{}};
const twLicenses = window.TW_LICENSES || {products:[],official_search:"",note:""};
const APP_VERSION="V24";
function safeJSONStorage(key,fallback){
  try{
    const raw=localStorage.getItem(key);
    if(raw===null)return fallback;
    const value=JSON.parse(raw);
    return value===null?fallback:value;
  }catch(err){
    console.warn("Invalid localStorage JSON:",key,err);
    return fallback;
  }
}
function markLocalChanged(){
  localStorage.setItem("pigSyncLocalModified",new Date().toISOString());
}
function localModifiedAt(){
  return localStorage.getItem("pigSyncLocalModified") || localStorage.getItem("pigSyncLastPull") || "";
}

let atlasLimit = 72;
let atlasLargeView = false;
let currentAtlasImage = null;
let currentActionDiseaseIndex = null;
let actionChecklistState = safeJSONStorage("pigActionChecklist",{});
let trackedCases = safeJSONStorage("pigTrackedCases",[]);
let labOrders = safeJSONStorage("pigLabOrders",[]);
let treatmentPlans = safeJSONStorage("pigTreatmentPlans",[]);
let dailyTaskChecks = safeJSONStorage("pigDailyTaskChecks",{});
let activeTrackedCaseId = null;
let activeTreatmentPlanId = null;
let activeLabOrderId = null;
let pendingTrackedCaseTemplate = null;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const normalize = s => (s||"").toLowerCase().replace(/\s+/g,"");
const uniq = arr => [...new Set(arr.filter(Boolean))];
const diseaseLabel = d => d ? (d.abbr ? `${d.name}（${d.abbr}）` : d.name) : "";
const diseaseSearchBlob = d => [d?.name,d?.abbr,d?.english_name,d?.category,d?.intro,Object.values(d?.sections||{}).join(" "),...(d?.symptom_tags||[])].filter(Boolean).join(" ");
const imageDiseaseLabel = im => {
  const d = Number.isInteger(im?.disease_index) ? diseases[im.disease_index] : null;
  return d ? diseaseLabel(d) : (im?.disease_abbr ? `${im.disease}（${im.disease_abbr}）` : (im?.disease||""));
};
const diseaseByName = name => diseases.find(d=>d.name===name) || null;
const diseaseLabelByName = name => {
  const d=diseaseByName(name);
  return d?diseaseLabel(d):(name||"");
};

let favorites = new Set(safeJSONStorage("pigDiseaseFavs",[]));
let caseHistory = safeJSONStorage("pigDiseaseCases",[]);
let selectedTags = new Set(), selectedSyndromes = new Set(), selectedLesions = new Set(), selectedEnv = new Set();
let absentTags = new Set();
let selectedOrgan = null;
let selectedOrganLesions = new Set();
let currentStep = 1;
let lastRanked = [], lastDetectedTags = new Set();

const symptomTags = [...new Set(diseases.flatMap(d=>d.symptom_tags||[]))].sort();
const syndromeDefs = {
  "呼吸道":["咳嗽","呼吸困難","鼻液","發紺/皮膚變色"],
  "腸道":["腹瀉","嘔吐","便秘","食慾下降"],
  "神經":["神經症狀"],
  "繁殖":["流產/繁殖障礙","乳房/泌乳"],
  "皮膚":["皮膚病灶","搔癢","發紺/皮膚變色"],
  "跛行／關節":["跛行/關節"],
  "全身性":["發燒","食慾下降","消瘦","貧血/蒼白","黃疸"],
  "猝死／高死亡":["猝死","仔豬高死亡"]
};
const lesionDefs = [
  "肺實變／肺炎","胸膜炎／胸腔積液","心包炎","淋巴結腫大","腸炎／腸壁病變","出血性腸炎／血便",
  "肝臟病變","脾臟腫大／梗死","腎臟出血點／腫大","皮膚出血／紫斑","關節腫脹／積液","腦膜／神經病變",
  "流產胎兒異常","胃潰瘍／胃出血","多發性漿膜炎"
];
const envDefs = [
  "高溫熱緊迫","低溫／受寒","濕度過高","通風不足","氨氣／粉塵高","日夜溫差大",
  "飼養密度高","近期混群／轉欄","飲水異常","近期換料","疑似黴菌毒素","消毒／生物安全疑慮"
];

const synonyms = {
  "發燒":["發燒","發燒","發熱","發熱","高熱","高熱","體溫高","體溫高"],
  "腹瀉":["腹瀉","腹瀉","下痢","拉稀","水瀉","水瀉","稀便"],
  "嘔吐":["嘔吐","嘔吐"],
  "咳嗽":["咳嗽"],
  "呼吸困難":["呼吸困難","呼吸困難","喘","氣喘","氣喘","腹式呼吸","呼吸急促","張口呼吸","張口呼吸"],
  "鼻液":["鼻液","鼻涕","流鼻水"],
  "發紺/皮膚變色":["發紺","發紺","發紫","發紫","耳朵紫","紫斑","皮膚變色","皮膚變色"],
  "神經症狀":["抽搐","震顫","震顫","轉圈","轉圈","共濟失調","共濟失調","麻痺","麻痹","神經","划水"],
  "流產/繁殖障礙":["流產","流產","死胎","木乃伊","返情","不孕","早產","早產","弱仔"],
  "跛行/關節":["跛行","關節","關節","蹄","站不起","跪地"],
  "猝死":["猝死","突然死亡","急死"],
  "皮膚病灶":["皮疹","水皰","水泡","結痂","結痂","皮膚","皮膚","紅斑","紅斑","膿皰","膿皰"],
  "食慾下降":["食慾下降","食慾下降","不吃","不食","厭食","厭食"],
  "消瘦":["消瘦","變瘦","變瘦","生長遲緩","生長遲緩","僵豬","僵豬"],
  "便秘":["便秘","不排便"],
  "搔癢":["搔癢","瘙癢","很癢","很癢","蹭牆","蹭牆"],
  "黃疸":["黃疸","黃疸","變黃","變黃"],
  "貧血/蒼白":["貧血","貧血","蒼白","蒼白"],
  "乳房/泌乳":["乳房","沒奶","沒奶","無乳","無乳","缺乳"]
};
const sectionLabels={pathogen:"病原體",epidemiology:"流行病學",clinical:"臨床症狀",pathology:"病理變化",diagnosis:"診斷",control:"防治措施",treatment:"治療",prevention:"預防",formula:"方劑"};

const ageKeywords = {
  "新生仔豬":["新生","初生","出生","1日齡","2日齡","3日齡","仔豬"],
  "哺乳仔豬":["哺乳","乳豬","仔豬","吃奶"],
  "保育豬":["保育","斷奶","斷乳","仔豬"],
  "肉豬":["育肥","肥育","生長豬","育成豬","肉豬"],
  "後備母豬":["後備","青年母豬"],
  "懷孕母豬":["妊娠","懷孕","母豬","流產","死胎","木乃伊"],
  "哺乳母豬":["哺乳母豬","產後","母豬","無乳","乳房"],
  "公豬":["公豬","種公豬"]
};

const lesionKeywordMap = {
 "肺實變／肺炎":["肺炎","肺實變","肺臟實變","肺葉實變","肺腫大","肺水腫"],
 "胸膜炎／胸腔積液":["胸膜炎","胸腔積液","胸膜粘連","胸膜黏連"],
 "心包炎":["心包炎","心包積液"],
 "淋巴結腫大":["淋巴結腫大","淋巴結出血","淋巴結水腫"],
 "腸炎／腸壁病變":["腸炎","腸黏膜","腸粘膜","腸壁","小腸","結腸"],
 "出血性腸炎／血便":["出血性腸炎","血便","腸出血"],
 "肝臟病變":["肝腫大","肝壞死","肝出血","肝臟"],
 "脾臟腫大／梗死":["脾腫大","脾梗死","脾臟"],
 "腎臟出血點／腫大":["腎出血","腎腫大","腎臟","針尖狀出血"],
 "皮膚出血／紫斑":["皮膚出血","紫斑","發紺","耳部發紫"],
 "關節腫脹／積液":["關節腫","關節積液","關節炎"],
 "腦膜／神經病變":["腦膜炎","腦充血","腦水腫","神經"],
 "流產胎兒異常":["流產","死胎","木乃伊","胎兒"],
 "胃潰瘍／胃出血":["胃潰瘍","胃出血"],
 "多發性漿膜炎":["多發性漿膜炎","漿膜炎","纖維素性胸膜炎","纖維素性心包炎"]
};

const organDefs = {
  "肺／呼吸道": {
    icon:"🫁",
    organKeywords:["肺","氣管","支氣管","鼻腔","呼吸道"],
    lesions:{
      "暗紅／紫紅實變":["暗紅","紫紅","實變","肺葉實變"],
      "肺水腫":["肺水腫","水腫","泡沫液"],
      "出血":["肺出血","出血斑","出血點"],
      "壞死／膿瘍":["壞死","膿腫","膿性"],
      "胸膜黏連":["胸膜粘連","胸膜黏連"],
      "纖維素性胸膜炎":["纖維素性胸膜炎","纖維素","胸膜炎"],
      "氣管泡沫／分泌物":["氣管","泡沫","分泌物"]
    }
  },
  "腸道": {
    icon:"➰",
    organKeywords:["腸","小腸","結腸","回腸","盲腸","直腸","腸系膜"],
    lesions:{
      "卡他性腸炎":["卡他性","腸炎"],
      "水樣內容物":["水樣","稀薄","液狀內容物"],
      "出血性腸炎":["出血性腸炎","腸出血","血便"],
      "纖維素／偽膜":["纖維素","偽膜","壞死性腸炎"],
      "腸壁變薄":["腸壁變薄","腸壁菲薄"],
      "腸壁增厚":["腸壁增厚","黏膜增厚","粘膜增厚"],
      "壞死／潰瘍":["壞死","潰瘍","糜爛"]
    }
  },
  "胃": {
    icon:"◒",
    organKeywords:["胃","胃黏膜","胃粘膜"],
    lesions:{
      "胃潰瘍":["胃潰瘍","潰瘍"],
      "胃出血":["胃出血","出血"],
      "胃黏膜糜爛":["胃黏膜","胃粘膜","糜爛"],
      "內容物異常":["胃內容物","胃內"]
    }
  },
  "肝臟": {
    icon:"⬭",
    organKeywords:["肝","肝臟"],
    lesions:{
      "腫大":["肝腫大","腫大"],
      "出血":["肝出血","出血點"],
      "壞死灶":["肝壞死","壞死灶","壞死點"],
      "黃染／黃疸":["黃染","黃疸"],
      "纖維素覆蓋":["纖維素","肝包膜"]
    }
  },
  "脾臟": {
    icon:"▰",
    organKeywords:["脾","脾臟"],
    lesions:{
      "脾腫大":["脾腫大","腫大"],
      "脾梗死":["脾梗死","梗死"],
      "出血":["脾出血","出血"],
      "邊緣異常":["邊緣","脾緣"]
    }
  },
  "腎臟／泌尿": {
    icon:"◉",
    organKeywords:["腎","腎臟","膀胱","泌尿"],
    lesions:{
      "針尖狀出血":["針尖","出血點","腎出血"],
      "腎腫大":["腎腫大","腫大"],
      "蒼白":["腎蒼白","蒼白"],
      "腎盂／膀胱炎症":["腎盂","膀胱","炎症"]
    }
  },
  "心臟／心包": {
    icon:"♥",
    organKeywords:["心","心臟","心包","心肌"],
    lesions:{
      "心包積液":["心包積液","心包內"],
      "纖維素性心包炎":["纖維素性心包炎","心包炎","纖維素"],
      "心肌變性":["心肌變性","虎斑心","心肌"],
      "出血":["心內膜出血","心外膜出血","心臟出血"]
    }
  },
  "淋巴結": {
    icon:"⬢",
    organKeywords:["淋巴結","淋巴"],
    lesions:{
      "腫大":["淋巴結腫大","腫大"],
      "出血":["淋巴結出血","出血"],
      "水腫":["淋巴結水腫","水腫"],
      "壞死":["淋巴結壞死","壞死"]
    }
  },
  "腦／神經": {
    icon:"◌",
    organKeywords:["腦","腦膜","神經","脊髓"],
    lesions:{
      "腦膜充血":["腦膜充血","充血"],
      "腦水腫":["腦水腫","水腫"],
      "腦膜炎":["腦膜炎","腦膜"],
      "出血":["腦出血","出血"],
      "肉眼病變不明顯":["無明顯病變","肉眼病變不明顯"]
    }
  },
  "皮膚／蹄部": {
    icon:"◈",
    organKeywords:["皮膚","蹄","蹄冠","蹄叉","吻突","耳部"],
    lesions:{
      "水皰":["水皰","水泡"],
      "潰瘍／糜爛":["潰瘍","糜爛","破潰"],
      "紫斑／發紺":["紫斑","發紺","紫紅"],
      "出血點":["皮膚出血","出血點"],
      "結痂":["結痂","痂皮"],
      "蹄殼脫落":["蹄殼脫落","蹄部"]
    }
  },
  "關節／骨骼": {
    icon:"⌁",
    organKeywords:["關節","骨","蹄","肌肉"],
    lesions:{
      "關節腫大":["關節腫","腫大"],
      "關節積液":["關節積液","關節液"],
      "纖維素／膿性關節炎":["關節炎","纖維素","膿性"],
      "肌肉出血":["肌肉出血","出血"]
    }
  },
  "生殖／胎兒／胎盤": {
    icon:"◎",
    organKeywords:["胎兒","胎盤","子宮","卵巢","生殖","木乃伊","死胎"],
    lesions:{
      "流產胎兒":["流產","胎兒"],
      "死胎":["死胎"],
      "木乃伊胎":["木乃伊"],
      "胎盤病變":["胎盤"],
      "子宮炎":["子宮炎","子宮"],
      "弱仔／畸形":["弱仔","畸形"]
    }
  },
  "多發性漿膜": {
    icon:"✦",
    organKeywords:["漿膜","胸膜","心包","腹膜"],
    lesions:{
      "胸膜炎":["胸膜炎"],
      "心包炎":["心包炎"],
      "腹膜炎":["腹膜炎"],
      "纖維素覆蓋":["纖維素"],
      "多發性漿膜炎":["多發性漿膜炎","漿膜炎"]
    }
  }
};


function switchTab(name){
  $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  $$(".panel").forEach(p=>p.classList.toggle("active",p.id==="tab-"+name));
  if(name==="favorites") renderFavorites();
  if(name==="cases") renderCases();
  if(name==="tracker") renderTrackedCases();
  if(name==="dashboard") renderDashboard();
  if(name==="lab") renderLabOrders();
  if(name==="taiwan") renderTaiwanPractice();
  if(name==="licenses") renderLicenseGrid();
  if(name==="treatment") renderTreatmentPlans();
  if(name==="history") renderHistoryAnalysis();
  if(name==="amr") renderAmrMonitor();
  if(name==="backup") renderBackupPanel();
  if(name==="sync") renderSyncPanel();
}
$$(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));

const cats=[...new Set(diseases.map(d=>d.category))];
cats.forEach(c=>$("#categoryFilter").insertAdjacentHTML("beforeend",`<option>${esc(c)}</option>`));

function snippet(d){
  const s=d.sections?.clinical || d.intro || "";
  return s.slice(0,160)+(s.length>160?"…":"");
}
function cardHtml(d){
  const idx=diseases.indexOf(d);
  return `<article class="card">
    <div><span class="badge">${esc(d.category)}</span><span class="badge">圖譜 p.${d.print_page}</span></div>
    <h3>${esc(diseaseLabel(d))}</h3>
    <p>${esc(snippet(d))}</p>
    <div>${(d.symptom_tags||[]).slice(0,6).map(t=>`<span class="badge">${esc(t)}</span>`).join("")}</div>
    <div class="actions">
      <button class="primary" onclick="openDetail(${idx})">查看圖文與處置</button>
      <button class="secondary" onclick="openActionPlan(${idx})">處置決策卡</button>
      <button class="secondary" onclick="createTrackedCaseFromDisease(${idx})">追蹤病例</button>
      ${taiwanPractice.profiles?.[d.name]?`<button class="secondary" onclick="openTaiwanDisease('${esc(d.name)}')">台灣現行</button>`:""}
      ${twLicenses.products?.some(p=>(p.disease_keys||[]).includes(d.name))?`<button class="secondary" onclick="openLicensesForDisease('${esc(d.name)}')">台灣藥品／疫苗</button>`:""}
      <button class="secondary" onclick="toggleFav(${idx})">${favorites.has(idx)?"★ 已收藏":"☆ 收藏"}</button>
    </div>
  </article>`;
}
function renderDiseases(){
  const q=normalize($("#diseaseSearch").value);
  const cat=$("#categoryFilter").value;
  const arr=diseases.filter(d=>{
    if(cat && d.category!==cat) return false;
    if(!q) return true;
    const hay=normalize(diseaseSearchBlob(d));
    const parts=q.split(/[，,、 ]+/).filter(Boolean);
    return hay.includes(q) || parts.some(x=>hay.includes(x));
  });
  $("#resultCount").textContent=`找到 ${arr.length} 項`;
  $("#diseaseList").innerHTML=arr.map(cardHtml).join("");
}
$("#diseaseSearch").oninput=renderDiseases;
$("#categoryFilter").onchange=renderDiseases;

function toggleFav(idx){
  favorites.has(idx)?favorites.delete(idx):favorites.add(idx);
  localStorage.setItem("pigDiseaseFavs",JSON.stringify([...favorites])); markLocalChanged();
  renderDiseases(); renderFavorites();
}
window.toggleFav=toggleFav;

function renderFavorites(){
  const arr=[...favorites].map(i=>diseases[i]).filter(Boolean);
  $("#favoriteList").innerHTML=arr.length?arr.map(cardHtml).join(""):`<p class="muted">尚未收藏疾病。</p>`;
}



function escapeRegExp(s){
  return String(s||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}
function flexibleTextPattern(s){
  return escapeRegExp(String(s||"").trim()).replace(/\s+/g,"\\s*");
}
function cleanSourceTextForReading(text,images=[]){
  let out=String(text||"");
  // Remove repeated book/page headers that interrupt continuous reading.
  out=out
    .replace(/\n?\s*豬病診治原色圖譜\s*\n?\s*\d{3}\s*\n?/g,"\n")
    .replace(/\n?\s*[一二三四五六七八九十]+、豬常見傳染病\s*\n?\s*\d{3}\s*\n?/g,"\n");

  // Hide duplicated figure captions only when the extracted caption is short enough
  // to be safely represented below the corresponding image.
  for(const im of images||[]){
    const fig=String(im?.figure||"").trim();
    const cap=String(im?.caption||"").trim();
    if(!fig || !cap || cap.length>180) continue;
    try{
      const re=new RegExp("\\s*"+flexibleTextPattern(fig)+"\\s*"+flexibleTextPattern(cap)+"\\s*","g");
      out=out.replace(re,"\n");
    }catch(e){}
  }
  return out.replace(/\n{3,}/g,"\n\n").trim();
}
function detailSectionId(key){ return `detail-sec-${key}`; }
window.scrollDetailSection=(key)=>{
  const el=document.getElementById(detailSectionId(key));
  if(!el)return;
  el.scrollIntoView({behavior:"smooth",block:"start"});
};
window.toggleFullDiseaseAtlas=(idx,details)=>{
  if(!details?.open)return;
  const host=details.querySelector(".all-atlas-lazy");
  if(!host || host.dataset.loaded==="1")return;
  const d=diseases[idx];
  host.innerHTML=`<div class="reading-gallery all-atlas-gallery">${(d.images||[]).map(detailFigureHtml).join("")}</div>`;
  host.dataset.loaded="1";
};

const paragraphImageTerms=[
  "水皰","水疱","潰瘍","糜爛","結痂","出血","充血","水腫","壞死","梗死","積液","實變","黏連",
  "肺炎","胸膜炎","心包炎","腹膜炎","腸炎","胃炎","腦膜炎","關節炎","乳房炎","子宮炎",
  "肺","氣管","鼻","吻部","口腔","舌","蹄","皮膚","耳","眼","腸","小腸","大腸","結腸","直腸",
  "胃","肝","脾","腎","心","心肌","心包","淋巴結","腦","腦膜","關節","胎兒","胎盤","子宮","乳房",
  "流產","死胎","木乃伊","腹瀉","咳嗽","呼吸困難","發紺","跛行","膿瘍","膿腫","纖維素","偽膜",
  "蟲卵","蟲體","細菌","病毒","菌體","顯微","電鏡","塗片","培養","PCR","抗體","抗原",
  "清洗","沖洗","消毒","疫苗","免疫","注射","採樣","隔離","防護"
];

function normalizeReadingText(text){
  return String(text||"")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/\n[ \t]+/g,"\n")
    .replace(/([^\n。！？；：])\n(?=[^\n])/g,"$1 ")
    .replace(/[ \t]{2,}/g," ")
    .trim();
}
function splitLongReadingParagraph(text,maxChars=620){
  const t=String(text||"").trim();
  if(t.length<=maxChars)return t?[t]:[];
  const sentences=(t.match(/[^。！？；]+[。！？；]?/g)||[]).map(x=>x.trim()).filter(Boolean);
  if(sentences.length<=1){
    const out=[];
    for(let i=0;i<t.length;i+=maxChars)out.push(t.slice(i,i+maxChars));
    return out;
  }
  const out=[];let buf="";
  for(const sentence of sentences){
    if(buf && (buf+sentence).length>maxChars){out.push(buf.trim());buf=sentence;}
    else buf+=sentence;
  }
  if(buf.trim())out.push(buf.trim());
  return out;
}
function readingParagraphs(text){
  const normalized=normalizeReadingText(text);
  if(!normalized)return [];
  return normalized.split(/\n{2,}/).flatMap(p=>splitLongReadingParagraph(p)).filter(Boolean);
}
function parseFigureId(fig){
  const m=String(fig||"").match(/圖\s*(\d+)\s*-\s*(\d+)/);
  return m?{chapter:Number(m[1]),num:Number(m[2])}:null;
}
function paragraphFigureRanges(text){
  const ranges=[];
  const rx=/圖\s*(\d+)\s*-\s*(\d+)\s*(?:[～~－—至到]\s*圖?\s*(?:(\d+)\s*-\s*)?(\d+))?/g;
  let m;
  while((m=rx.exec(String(text||"")))){
    const chapter=Number(m[1]),start=Number(m[2]);
    const endChapter=m[4]?(m[3]?Number(m[3]):chapter):chapter;
    const end=m[4]?Number(m[4]):start;
    if(chapter===endChapter)ranges.push({chapter,start:Math.min(start,end),end:Math.max(start,end)});
    else ranges.push({chapter,start,end:start});
  }
  return ranges;
}
function paragraphHasFigure(paragraph,im){
  const id=parseFigureId(im?.figure);
  if(!id)return false;
  const exact=new RegExp(`圖\\s*${id.chapter}\\s*-\\s*${id.num}(?!\\d)`);
  if(exact.test(paragraph))return true;
  return paragraphFigureRanges(paragraph).some(r=>r.chapter===id.chapter&&id.num>=r.start&&id.num<=r.end);
}
function imageMatchTokens(im){
  const src=normalize([im?.caption,(im?.organs||[]).join(" ")].join(" "));
  const hits=paragraphImageTerms.filter(t=>src.includes(normalize(t)));
  return uniq(hits);
}
function paragraphImageScore(paragraph,im){
  if(paragraphHasFigure(paragraph,im))return 100;
  const p=normalize(paragraph);
  const tokens=imageMatchTokens(im);
  let score=0;
  for(const t of tokens){
    const nt=normalize(t);
    if(!nt||!p.includes(nt))continue;
    score+=nt.length>=4?4:nt.length===3?3:2;
  }
  for(const organ of im?.organs||[]){
    const no=normalize(organ.replace(/[／/].*/,""));
    if(no&&no.length>=1&&p.includes(no))score+=2;
  }
  return score;
}
function assignImagesToParagraphs(text,images=[]){
  const paragraphs=readingParagraphs(cleanSourceTextForReading(text,images));
  const assigned=paragraphs.map(()=>[]);
  const leftovers=[];
  for(const im of images||[]){
    let bestIndex=-1,bestScore=-1;
    for(let i=0;i<paragraphs.length;i++){
      const score=paragraphImageScore(paragraphs[i],im);
      if(score>bestScore){bestScore=score;bestIndex=i;}
    }
    // Figure reference is trusted; keyword-only insertion needs stronger evidence.
    if(bestIndex>=0 && (bestScore>=100 || bestScore>=6))assigned[bestIndex].push(im);
    else leftovers.push(im);
  }
  return {paragraphs,assigned,leftovers};
}
function readingParagraphHtml(text,images=[]){
  const result=assignImagesToParagraphs(text,images);
  let html="";
  result.paragraphs.forEach((paragraph,i)=>{
    html+=`<div class="reading-pair">
      <p class="source-text reading-paragraph">${esc(paragraph)}</p>
      ${result.assigned[i].length?`<div class="paragraph-images">${detailImageStripHtml(result.assigned[i])}</div>`:""}
    </div>`;
  });
  if(result.leftovers.length){
    html+=`<div class="inline-image-block unmatched-images">
      <div class="inline-image-title">本章其他相關圖譜 · ${result.leftovers.length} 張</div>
      <div class="muted paragraph-match-note">這些圖片未找到足夠明確的段落配對，因此保留在本章尾端，避免錯誤插圖。</div>
      ${detailImageStripHtml(result.leftovers)}
    </div>`;
  }
  return html;
}
function detailImageSection(im){
  const type=im?.image_type||"";
  const cap=normalize([im?.figure,im?.caption].filter(Boolean).join(" "));
  if(type==="病理解剖") return "pathology";
  if(type==="臨床外觀") return "clinical";
  if(type==="病原／檢驗"){
    if(["病原","病毒","細菌","菌體","蟲卵","蟲體","顯微","電鏡","塗片"].some(k=>cap.includes(normalize(k)))) return "pathogen";
    return "diagnosis";
  }
  if(["消毒","清洗","沖洗","免疫","疫苗","注射","隔離","防護","焚燒","熏蒸","採樣","送檢"].some(k=>cap.includes(normalize(k)))) return "control";
  if(["剖檢","病理","出血","壞死","水腫","梗死","積液","潰瘍","實變","腫大"].some(k=>cap.includes(normalize(k)))) return "pathology";
  if(["症狀","病豬","水疱","水皰","跛行","腹瀉","咳嗽","皮膚","流產","死胎"].some(k=>cap.includes(normalize(k)))) return "clinical";
  return "other";
}
function detailImagesForSection(d,key){
  return (d.images||[]).filter(im=>detailImageSection(im)===key);
}
function detailFigureHtml(im){
  const globalIndex=pigImages.findIndex(x=>x.src===im.src);
  const caption=[im.figure,im.caption].filter(Boolean).join("｜") || `來源 PDF 第 ${im.pdf_page} 頁`;
  const type=im.image_type||"圖譜";
  return `<figure class="reading-figure">
    <button class="reading-image-btn" onclick="openAtlasImage(${globalIndex})" title="放大查看圖片">
      <img loading="lazy" src="${im.src}" alt="${esc(caption)}">
    </button>
    <figcaption>
      <div class="reading-figure-meta"><span class="badge">${esc(type)}</span>${(im.organs||[]).slice(0,2).map(o=>`<span class="badge">${esc(o)}</span>`).join("")}</div>
      <div>${esc(caption)}</div>
      <small>原書 PDF 第 ${esc(String(im.pdf_page||"—"))} 頁</small>
    </figcaption>
  </figure>`;
}
window.expandReadingImages=(button)=>{
  if(!button)return;
  const host=button.previousElementSibling;
  if(!host || host.dataset.expanded==="1")return;
  const raw=button.dataset.imageIndexes||"";
  const indexes=raw.split(",").map(x=>Number(x)).filter(Number.isInteger);
  const extra=indexes.map(i=>pigImages[i]).filter(Boolean);
  host.insertAdjacentHTML("beforeend",extra.map(detailFigureHtml).join(""));
  host.dataset.expanded="1";
  button.remove();
};
function detailImageStripHtml(images,limit=6){
  if(!images?.length)return "";
  const first=images.slice(0,limit);
  const rest=images.slice(limit);
  const indexes=rest.map(im=>pigImages.findIndex(x=>x.src===im.src)).filter(i=>i>=0);
  return `<div class="reading-gallery" data-expanded="${rest.length?"0":"1"}">${first.map(detailFigureHtml).join("")}</div>${
    rest.length?`<button class="secondary reading-more-btn" data-image-indexes="${indexes.join(",")}" onclick="expandReadingImages(this)">顯示其餘 ${rest.length} 張圖片</button>`:""
  }`;
}
function openDetail(idx){
  const d=diseases[idx];
  if(!d)return;
  $("#detailCategory").textContent=`${d.category} · 原書頁 ${d.print_page} · 共 ${(d.images||[]).length} 張圖`;
  $("#detailTitle").textContent=diseaseLabel(d);

  const grouped={};
  ["pathogen","epidemiology","clinical","pathology","diagnosis","control","treatment","prevention","formula","other"].forEach(k=>grouped[k]=detailImagesForSection(d,k));
  const shownInSections=new Set();
  Object.values(grouped).flat().forEach(im=>shownInSections.add(im.src));

  let html=`<div class="detail reading-detail">
    <div class="notice">本頁依原書章節與段落重新編排圖文：先依原書圖號／圖號範圍定位圖片，再以器官與病變關鍵詞輔助配對；信心不足的圖片保留在章節尾端，不強制插入錯誤段落。閱讀模式會隱藏已在圖片下方重複顯示的短圖說與書頁頁眉，但不改變原書疾病敘述。圖片分類只為改善閱讀，不代表新增診斷結論。原書為 2020 年出版，實際治療、處方藥、抗菌藥、停藥期、疫苗及法定通報仍應依台灣現行規範與獸醫師判斷。</div>`;

  const availableSections=[
    {key:"intro",label:"疾病概述",show:!!d.intro},
    ...["pathogen","epidemiology","clinical","pathology","diagnosis","control","treatment","prevention","formula"]
      .map(key=>({key,label:sectionLabels[key]||key,show:!!d.sections?.[key] || (grouped[key]||[]).length>0})),
    {key:"other",label:"補充圖解",show:(grouped.other||[]).length>0}
  ].filter(x=>x.show);

  html+=`<nav class="detail-quick-nav" aria-label="疾病內容快速導覽">
    <span class="detail-quick-label">快速導覽</span>
    ${availableSections.map(x=>`<button class="secondary" onclick="scrollDetailSection('${x.key}')">${esc(x.label)}</button>`).join("")}
  </nav>`;

  if(d.intro){
    html+=`<section class="section reading-section" id="${detailSectionId("intro")}">
      <div class="reading-section-head"><h3>疾病概述</h3><span class="badge">原書內容</span></div>
      ${readingParagraphHtml(d.intro,[])}
    </section>`;
  }

  const order=["pathogen","epidemiology","clinical","pathology","diagnosis","control","treatment","prevention","formula"];
  for(const k of order){
    const v=d.sections?.[k];
    const imgs=grouped[k]||[];
    if(!v && !imgs.length)continue;
    html+=`<section class="section reading-section" id="${detailSectionId(k)}">
      <div class="reading-section-head"><h3>${esc(sectionLabels[k]||k)}</h3><span class="badge">原書內容</span></div>
      ${v?readingParagraphHtml(v,imgs):(imgs.length?`<div class="inline-image-block">${detailImageStripHtml(imgs)}</div>`:"")}
    </section>`;
  }

  const other=grouped.other||[];
  if(other.length){
    html+=`<section class="section reading-section" id="${detailSectionId("other")}">
      <div class="reading-section-head"><h3>補充圖解</h3><span class="badge">原書圖片</span></div>
      <p class="muted">以下圖片在原書中屬操作、管理或無法可靠歸入單一章節的補充圖解。</p>
      ${detailImageStripHtml(other)}
    </section>`;
  }

  if(d.images?.length){
    html+=`<details class="all-atlas-details" ontoggle="toggleFullDiseaseAtlas(${idx},this)">
      <summary>本病全部圖譜｜${d.images.length} 張</summary>
      <div class="notice compact-notice">這裡保留本疾病條目中的全部圖片，方便核對是否有漏圖。為降低 iPad／手機負擔，完整索引會在第一次展開時才建立；上方圖文閱讀區已依圖片類型與圖說顯示所有圖片。</div>
      <div class="all-atlas-lazy" data-loaded="0"></div>
    </details>`;
  }

  html+=`<div class="actions detail-bottom-actions">
    <button class="primary" onclick="openActionPlan(${idx});document.querySelector('#detailDialog').close();">開啟處置決策卡</button>
    ${taiwanPractice.profiles?.[d.name]?`<button class="secondary" onclick="document.querySelector('#detailDialog').close();openTaiwanDisease('${esc(d.name)}')">查看台灣現行資料</button>`:""}
    ${twLicenses.products?.some(p=>(p.disease_keys||[]).includes(d.name))?`<button class="secondary" onclick="document.querySelector('#detailDialog').close();openLicensesForDisease('${esc(d.name)}')">查看台灣藥品／疫苗許可</button>`:""}
  </div></div>`;
  $("#detailBody").innerHTML=html;
  $("#detailDialog").showModal();
}
window.openDetail=openDetail;
$("#closeDialog").onclick=()=>$("#detailDialog").close();

/* ---------- Wizard ---------- */
$("#stepPills").innerHTML=[1,2,3,4,5].map(n=>`<span class="step-pill" data-pill="${n}">${n}</span>`).join("");
$("#syndromeChips").innerHTML=Object.keys(syndromeDefs).map(t=>`<button class="chip" data-syndrome="${esc(t)}">${esc(t)}</button>`).join("");
$("#symptomChips").innerHTML=symptomTags.map(t=>`<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join("");
$("#lesionChips").innerHTML=lesionDefs.map(t=>`<button class="chip" data-lesion="${esc(t)}">${esc(t)}</button>`).join("");
$("#environmentChips").innerHTML=envDefs.map(t=>`<button class="chip" data-env="${esc(t)}">${esc(t)}</button>`).join("");

function chipToggle(container, selector, set, key){
  $(container).onclick=e=>{
    const b=e.target.closest(selector); if(!b)return;
    const t=b.dataset[key];
    set.has(t)?set.delete(t):set.add(t);
    b.classList.toggle("active",set.has(t));
    if(key==="syndrome"){
      for(const tag of syndromeDefs[t]||[]){
        if(set.has(t)) selectedTags.add(tag);
      }
      $$("#symptomChips .chip").forEach(x=>x.classList.toggle("active",selectedTags.has(x.dataset.tag)));
    }
  };
}
chipToggle("#syndromeChips",".chip",selectedSyndromes,"syndrome");
chipToggle("#symptomChips",".chip",selectedTags,"tag");
chipToggle("#lesionChips",".chip",selectedLesions,"lesion");
chipToggle("#environmentChips",".chip",selectedEnv,"env");

function renderStep(){
  $$(".wizard-step").forEach(s=>s.classList.toggle("active",+s.dataset.step===currentStep));
  $$(".step-pill").forEach(p=>{
    const n=+p.dataset.pill;
    p.classList.toggle("active",n===currentStep);
    p.classList.toggle("done",n<currentStep);
  });
  $("#prevStep").disabled=currentStep===1;
  $("#nextStep").classList.toggle("hidden",currentStep===5);
  $("#analyzeBtn").classList.toggle("hidden",currentStep!==5);
}
$("#prevStep").onclick=()=>{if(currentStep>1){currentStep--;renderStep();}};
$("#nextStep").onclick=()=>{if(currentStep<5){currentStep++;renderStep();}};
renderStep();

function detectedTags(text){
  const n=normalize(text);
  const found=new Set(selectedTags);
  for(const [tag,words] of Object.entries(synonyms)){
    if(words.some(w=>n.includes(normalize(w)))) found.add(tag);
  }
  return found;
}
function ageEvidence(d, ageGroup){
  if(!ageGroup) return {score:0, reason:null};
  const src=(d.sections?.clinical||"")+" "+(d.sections?.epidemiology||"");
  const kws=ageKeywords[ageGroup]||[];
  if(kws.some(k=>src.includes(k))) return {score:8,reason:ageGroup};
  return {score:0,reason:null};
}
function lesionEvidence(d){
  const path=d.sections?.pathology||"";
  let score=0,reasons=[];
  for(const lesion of selectedLesions){
    const kws=lesionKeywordMap[lesion]||[];
    if(kws.some(k=>path.includes(k))){score+=14;reasons.push(lesion);}
  }
  const free=$("#lesionText").value.trim();
  for(const token of free.split(/[，,。；;、\s]+/).filter(x=>x.length>=2)){
    if(normalize(path).includes(normalize(token))){score+=5;reasons.push(token);}
  }
  return {score,reasons:uniq(reasons)};
}
function textOverlap(d,text){
  const clinical=d.sections?.clinical||"", epi=d.sections?.epidemiology||"", path=d.sections?.pathology||"";
  const all=normalize([d.name,clinical,epi,path].join(" "));
  let score=0,reasons=[];
  const chunks=text.split(/[，,。；;、\s]+/).map(x=>x.trim()).filter(x=>x.length>=2);
  for(const c of chunks){
    const nc=normalize(c);
    if(all.includes(nc)){score+=7;reasons.push(c);continue;}
    let hit=false;
    for(let len=Math.min(4,nc.length);len>=2&&!hit;len--){
      for(let i=0;i<=nc.length-len;i++){
        if(all.includes(nc.slice(i,i+len))){score+=1.5;hit=true;break;}
      }
    }
  }
  return {score,reasons:uniq(reasons)};
}
function scoreDisease(d,text,tags){
  let score=0,support=[], gaps=[];
  const dTags=new Set(d.symptom_tags||[]);
  for(const tag of tags){
    if(dTags.has(tag)){score+=15;support.push(tag);}
  }
  // 「沒有」的症狀只做溫和扣分：臨床上症狀未出現不等於可完全排除疾病。
  for(const tag of absentTags){
    if(dTags.has(tag)){score-=7;gaps.push(`目前回答「沒有 ${tag}」，但原書此疾病條目有相關表現`);}
  }
  const age=ageEvidence(d,$("#ageGroup").value); score+=age.score; if(age.reason)support.push(age.reason);
  const lesion=lesionEvidence(d); score+=lesion.score; support.push(...lesion.reasons);
  const tx=textOverlap(d,text+" "+$("#caseSummary").value); score+=tx.score; support.push(...tx.reasons);
  const t=parseFloat($("#temp").value);
  const clinical=d.sections?.clinical||"";
  if(!isNaN(t) && t>=40 && /發熱|高熱|體溫升高/.test(clinical)){score+=5;support.push("高體溫");}
  if(selectedSyndromes.size){
    const matched=[...selectedSyndromes].filter(s=>(syndromeDefs[s]||[]).some(t=>dTags.has(t)));
    score+=matched.length*6; support.push(...matched.map(x=>x+"症候群"));
  }
  const keyTags=[...tags].filter(t=>!dTags.has(t));
  gaps.push(...keyTags.slice(0,3).map(t=>`輸入有「${t}」，原書此疾病條目的症狀標籤未明確對應`));
  return {score,support:uniq(support).slice(0,10),gaps:uniq(gaps).slice(0,5)};
}
function sampleSuggestions(d){
  const src=(d.sections?.clinical||"")+" "+(d.sections?.pathology||"")+" "+(d.sections?.diagnosis||"");
  const arr=[];
  if(/肺|呼吸|咳嗽/.test(src)) arr.push("鼻／口咽拭子或肺部病灶樣本");
  if(/腹瀉|腸|糞/.test(src)) arr.push("新鮮糞便、腸內容物或腸段");
  if(/流產|死胎|胎兒|繁殖/.test(src)) arr.push("流產胎兒、胎盤及母豬血清／拭子");
  if(/神經|腦|腦膜/.test(src)) arr.push("腦／腦膜相關樣本");
  if(/皮膚|水皰|結痂/.test(src)) arr.push("皮膚病灶、痂皮或水皰液");
  if(/關節/.test(src)) arr.push("關節液或關節病灶樣本");
  if(!arr.length) arr.push("急性期病豬血液、適當病灶組織與同群對照樣本");
  return uniq(arr).slice(0,3);
}
function environmentAdvice(){
  const out=[];
  if(selectedEnv.has("高溫熱緊迫")) out.push("優先降溫並提高有效風速；確認飲水量、水壓與水嘴流量。");
  if(selectedEnv.has("低溫／受寒")) out.push("降低賊風與冷應激，尤其仔豬區需確認躺臥區實際體感溫度。");
  if(selectedEnv.has("濕度過高")) out.push("降低舍內濕度與地面長時間潮濕，檢查漏水、清洗後乾燥與通風。");
  if(selectedEnv.has("通風不足")||selectedEnv.has("氨氣／粉塵高")) out.push("檢查最小通風量、進排風是否短路，並降低氨氣與粉塵負荷。");
  if(selectedEnv.has("日夜溫差大")) out.push("降低日夜溫差，避免夜間過冷與白天過熱造成反覆緊迫。");
  if(selectedEnv.has("飼養密度高")) out.push("降低欄內密度與競爭，確認採食、飲水位置足夠。");
  if(selectedEnv.has("近期混群／轉欄")) out.push("減少不必要混群，維持全進全出與同批次管理。");
  if(selectedEnv.has("飲水異常")) out.push("立即量測水嘴流量、水壓與飲水可及性；必要時檢查水質與管線。");
  if(selectedEnv.has("近期換料")) out.push("核對換料時間、配方、原料批次及採食量變化。");
  if(selectedEnv.has("疑似黴菌毒素")) out.push("保留飼料樣本，檢查原料黴變、儲存與料塔結塊；必要時送驗。");
  if(selectedEnv.has("消毒／生物安全疑慮")) out.push("限制跨棟人車與器具，重新檢查清洗、乾燥、消毒與空舍流程。");
  if(!out.length) out.push("確認溫度、濕度、通風、飲水、密度與近期換料／轉欄變化，避免把環境性問題誤判為單一感染症。");
  return out;
}
function nextChecks(d){
  const arr=[];
  if(d.sections?.diagnosis) arr.push("對照原書「診斷」段落中的鑑別重點。");
  if(d.sections?.pathology) arr.push("若有死亡豬，記錄並拍攝主要器官病變後再比對圖譜。");
  arr.push(...sampleSuggestions(d).map(x=>"採樣可考慮："+x));
  return uniq(arr).slice(0,4);
}
function makeSummary(tags){
  const pieces=[];
  if($("#ageGroup").value) pieces.push(["階段",$("#ageGroup").value]);
  if($("#temp").value) pieces.push(["體溫",$("#temp").value+" ℃"]);
  if($("#morbidity").value) pieces.push(["發病率",$("#morbidity").value+"%"]);
  if($("#mortality").value) pieces.push(["死亡率",$("#mortality").value+"%"]);
  if(selectedSyndromes.size) pieces.push(["症候群",[...selectedSyndromes].join("、")]);
  if(tags.size) pieces.push(["症狀",[...tags].join("、")]);
  if(selectedLesions.size) pieces.push(["病變",[...selectedLesions].join("、")]);
  if(selectedEnv.size) pieces.push(["環境",[...selectedEnv].join("、")]);
  return pieces;
}

function discriminatingTags(ranked,tags){
  const top=ranked.slice(0,5);
  if(top.length<2) return [];
  const answered=new Set([...tags,...absentTags]);
  const candidates=symptomTags.filter(tag=>!answered.has(tag));
  return candidates.map(tag=>{
    const yes=top.filter(x=>(x.d.symptom_tags||[]).includes(tag)).length;
    const no=top.length-yes;
    const balance=Math.min(yes,no); // higher = better split
    return {tag,yes,no,balance};
  }).filter(x=>x.yes>0 && x.no>0)
    .sort((a,b)=>b.balance-a.balance || Math.abs(top.length/2-a.yes)-Math.abs(top.length/2-b.yes))
    .slice(0,5);
}
function renderDiffMatrix(ranked,tags){
  const top=ranked.slice(0,5);
  if(!top.length){$("#diffLab").classList.add("hidden");return;}
  $("#diffLab").classList.remove("hidden");
  const discr=discriminatingTags(ranked,tags);
  const rows=uniq([...tags,...absentTags,...discr.map(x=>x.tag)]).slice(0,12);
  let html=`<table class="diff-matrix"><thead><tr><th>比較線索</th>${
    top.map((x,i)=>`<th>${i+1}. ${esc(diseaseLabel(x.d))}</th>`).join("")
  }</tr></thead><tbody>`;
  for(const tag of rows){
    html+=`<tr><td>${esc(tag)}${absentTags.has(tag)?' <span class="badge">已回答沒有</span>':tags.has(tag)?' <span class="badge">已回答有</span>':''}</td>`;
    for(const x of top){
      const has=(x.d.symptom_tags||[]).includes(tag);
      let cls=has?"matrix-yes":"matrix-no", symbol=has?"✓":"—";
      if(tags.has(tag)) cls=has?"matrix-user-yes":"matrix-no";
      if(absentTags.has(tag) && has){cls="matrix-user-no";symbol="✕";}
      html+=`<td class="${cls}">${symbol}</td>`;
    }
    html+=`</tr>`;
  }
  html+=`</tbody></table>`;
  $("#matrixWrap").innerHTML=html;

  $("#nextQuestions").innerHTML=discr.length?discr.map(q=>`
    <div class="question-row" data-q="${esc(q.tag)}">
      <div><b>是否有「${esc(q.tag)}」？</b><div class="info-gain">目前前 ${top.length} 名中：${q.yes} 項有此線索、${q.no} 項未標記，可協助縮小範圍。</div></div>
      <div class="question-actions">
        <button class="yes-btn" onclick="answerDiscriminator('${esc(q.tag)}',true)">有</button>
        <button class="no-btn" onclick="answerDiscriminator('${esc(q.tag)}',false)">沒有</button>
      </div>
    </div>`).join(""):`<p class="muted">目前前幾名疾病在可用症狀標籤上的差異已不大；建議改用病理解剖、檢體與實驗室檢驗繼續區分。</p>`;
}
window.answerDiscriminator=(tag,yes)=>{
  if(yes){
    selectedTags.add(tag); absentTags.delete(tag);
  }else{
    absentTags.add(tag); selectedTags.delete(tag);
  }
  $$("#symptomChips .chip").forEach(x=>x.classList.toggle("active",selectedTags.has(x.dataset.tag)));
  analyzeCase(false);
};
$("#resetAnswers").onclick=()=>{
  absentTags.clear();
  analyzeCase(false);
};

function saveCase(ranked,tags){
  const now=new Date();
  const c={
    id:Date.now(),
    time:now.toLocaleString(),
    ageGroup:$("#ageGroup").value,
    temp:$("#temp").value,
    morbidity:$("#morbidity").value,
    mortality:$("#mortality").value,
    symptoms:[...tags],
    absentSymptoms:[...absentTags],
    syndromes:[...selectedSyndromes],
    lesions:[...selectedLesions],
    environment:[...selectedEnv],
    note:$("#symptomText").value.trim(),
    top:ranked.slice(0,5).map(x=>({name:x.d.name,score:x.score}))
  };
  caseHistory.unshift(c);
  caseHistory=caseHistory.slice(0,50);
  localStorage.setItem("pigDiseaseCases",JSON.stringify(caseHistory)); markLocalChanged();
}
function analyzeCase(save=true){
  const text=$("#symptomText").value.trim();
  const tags=detectedTags(text);
  // answers from V3 follow-up are part of the positive symptom set
  for(const t of selectedTags) tags.add(t);
  lastDetectedTags=tags;
  const hasInput=text||tags.size||selectedLesions.size||$("#caseSummary").value.trim()||absentTags.size;
  if(!hasInput){
    $("#matchList").innerHTML=`<div class="notice">請至少輸入症狀、病理解剖或病例描述。</div>`;return;
  }
  let ranked=diseases.map((d,i)=>({d,i,...scoreDisease(d,text,tags)}))
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12);
  lastRanked=ranked;
  const max=Math.max(1,...ranked.map(x=>x.score));
  const summary=makeSummary(tags);
  if(absentTags.size) summary.push(["已確認沒有",[...absentTags].join("、")]);
  $("#triageSummary").classList.remove("hidden");
  $("#triageSummary").innerHTML=`<h3>本次病例摘要</h3><div class="summary-grid">${
    summary.map(([k,v])=>`<div class="summary-item"><b>${esc(k)}</b><br>${esc(v)}</div>`).join("")
  }</div>`;
  renderDiffMatrix(ranked,tags);

  const envAdvice=environmentAdvice();
  $("#matchList").innerHTML=ranked.length?ranked.map((x,rank)=>{
    const pct=Math.max(1,Math.round(x.score/max*100));
    const next=nextChecks(x.d);
    return `<article class="match">
      <div class="match-grid">
        <div class="confidence">${pct}%</div>
        <div>
          <div class="eyebrow">鑑別候選 ${rank+1} · 相對線索匹配度</div>
          <h3>${esc(diseaseLabel(x.d))}</h3>
          <p>${esc(snippet(x.d))}</p>
        </div>
      </div>
      <div class="evidence">
        <div class="evidence-box"><h4>支持此疾病的線索</h4><ul>${x.support.length?x.support.map(r=>`<li>${esc(r)}</li>`).join(""):"<li>目前主要依文字／病變關鍵線索匹配</li>"}</ul></div>
        <div class="evidence-box"><h4>衝突或仍需確認</h4><ul>${x.gaps.length?x.gaps.map(r=>`<li>${esc(r)}</li>`).join(""):"<li>目前沒有明顯衝突線索，但仍需鑑別診斷與檢驗。</li>"}</ul></div>
      </div>
      <div class="next-check"><b>下一步檢查</b><ul>${next.map(r=>`<li>${esc(r)}</li>`).join("")}</ul></div>
      ${rank===0?`<div class="env-advice"><b>本病例環境／管理改善重點（系統輔助）</b><ul>${envAdvice.map(r=>`<li>${esc(r)}</li>`).join("")}</ul></div>`:""}
      <div class="actions"><button class="primary" onclick="openDetail(${x.i})">查看原書圖譜、診斷與防治</button><button class="secondary" onclick="openActionPlan(${x.i})">開啟處置決策卡</button><button class="secondary" onclick="createTrackedCaseFromDisease(${x.i})">建立追蹤病例</button></div>
    </article>`;
  }).join(""):`<div class="notice">目前沒有足夠線索。可增加日齡、體溫、主要症候群、病理解剖或環境資訊。</div>`;

  const mortality=parseFloat($("#mortality").value);
  const urgent=[...tags].some(t=>["發紺/皮膚變色","神經症狀","猝死"].includes(t)) || (!isNaN(mortality)&&mortality>=3);
  $("#triageNotice").classList.toggle("hidden",!urgent);
  $("#triageNotice").textContent=urgent
    ?"目前包含較高風險線索：先隔離異常豬、限制跨舍人車與器具、保留急性期與死亡豬採樣條件；若死亡持續增加或疑似重大傳染病，應儘快聯繫獸醫師與依規定處置。"
    :"";
  if(save) saveCase(ranked,tags);
  $("#diffLab").scrollIntoView({behavior:"smooth",block:"start"});
}
$("#analyzeBtn").onclick=()=>analyzeCase(true);

function renderCases(){
  if(!caseHistory.length){$("#caseList").innerHTML=`<p class="muted">尚無病例紀錄。</p>`;return;}
  $("#caseList").innerHTML=caseHistory.map(c=>`<article class="card">
    <div class="case-card-time">${esc(c.time)}</div>
    <h3>${esc(c.ageGroup||"未指定階段")} ${c.temp?`· ${esc(c.temp)}℃`:""}</h3>
    <p>${esc(c.note||"未輸入文字描述")}</p>
    <div>${(c.symptoms||[]).slice(0,6).map(x=>`<span class="badge">${esc(x)}</span>`).join("")}</div>
    ${(c.absentSymptoms||[]).length?`<p><b>已確認沒有：</b> ${(c.absentSymptoms||[]).map(esc).join("、")}</p>`:""}
    <p><b>前 5 項鑑別：</b> ${(c.top||[]).map(x=>esc(diseaseLabelByName(x.name))).join("、")||"無"}</p>
  </article>`).join("");
}
$("#clearCases").onclick=()=>{
  if(confirm("確定要清除全部本機病例紀錄？")){
    caseHistory=[];localStorage.removeItem("pigDiseaseCases");renderCases();
  }
};










/* ---------- V11 Taiwan Veterinary Drug License Layer ---------- */
function licenseProducts(){ return twLicenses.products||[]; }
function initLicenseDiseaseFilter(){
  if(!$("#licenseDiseaseFilter"))return;
  const diseases=[...new Set(licenseProducts().flatMap(p=>p.disease_keys||[]))].sort();
  diseases.forEach(d=>$("#licenseDiseaseFilter").insertAdjacentHTML("beforeend",`<option value="${esc(d)}">${esc(diseaseLabelByName(d))}</option>`));
}
function licenseFiltered(){
  const q=normalize($("#licenseSearch")?.value||"");
  const cat=$("#licenseCategory")?.value||"";
  const dis=$("#licenseDiseaseFilter")?.value||"";
  return licenseProducts().filter(p=>{
    if(cat && p.category!==cat)return false;
    if(dis && !(p.disease_keys||[]).includes(dis))return false;
    if(q){
      const hay=normalize([p.name,p.license,p.ingredient,p.form,p.indications,p.category,...(p.disease_keys||[]),...(p.disease_keys||[]).map(diseaseLabelByName)].join(" "));
      const parts=q.split(/[，,、 ]+/).filter(Boolean);
      if(!(hay.includes(q)||parts.every(x=>hay.includes(x)))) return false;
    }
    return true;
  });
}
function renderLicenseGrid(){
  if(!$("#licenseGrid"))return;
  const arr=licenseFiltered();
  $("#licenseCount").textContent=`已核對 ${licenseProducts().length} 張目前有效許可證；目前顯示 ${arr.length} 張。`;
  $("#licenseGrid").innerHTML=arr.length?arr.map(p=>{
    const idx=licenseProducts().indexOf(p);
    return `<article class="license-card">
      <div class="license-meta">
        <span class="badge">${esc(p.category)}</span>
        <span class="badge">${esc(p.form)}</span>
      </div>
      <h3>${esc(p.name)}</h3>
      <p><b>${esc(p.ingredient)}</b></p>
      <div class="license-expiry">${esc(p.license)} · 有效至 ${esc(p.expiry)}</div>
      <div class="license-indication">${esc(p.indications)}</div>
      <div class="license-disease-tags">${(p.disease_keys||[]).map(d=>`<span class="badge">${esc(diseaseLabelByName(d))}</span>`).join("")}</div>
      <div class="actions">
        <button class="primary" onclick="openLicenseDetail(${idx})">查看許可內容</button>
        <a class="secondary license-official-link" href="${p.url}" target="_blank" rel="noopener">官方頁面</a>
      </div>
    </article>`;
  }).join(""):`<p class="muted">沒有符合條件的已核對許可證。</p>`;
}
["#licenseSearch","#licenseCategory","#licenseDiseaseFilter"].forEach(sel=>{
  const el=$(sel); if(!el)return;
  el.addEventListener(el.tagName==="INPUT"?"input":"change",renderLicenseGrid);
});
window.openLicenseDetail=(idx)=>{
  const p=licenseProducts()[idx];if(!p)return;
  $("#licenseDialogMeta").textContent=`${p.category} · ${p.license}`;
  $("#licenseDialogTitle").textContent=p.name;
  $("#licenseDialogBody").innerHTML=`
    <div class="license-warning"><b>不是自動處方：</b>本系統只整理官方許可證資料。劑量、療程、混藥方式、停藥期與是否適合本病例，應依產品標籤／仿單、有效許可證及執業獸醫師判斷。</div>
    <div class="license-detail-grid">
      <div class="license-detail-item"><b>成分</b>${esc(p.ingredient)}</div>
      <div class="license-detail-item"><b>劑型</b>${esc(p.form)}</div>
      <div class="license-detail-item"><b>使用類別</b>${esc(p.rx)}</div>
      <div class="license-detail-item"><b>有效期限</b>${esc(p.expiry)}</div>
    </div>
    <section class="taiwan-section"><h3>官方核准效能／適應症</h3><p>${esc(p.indications)}</p></section>
    <section class="taiwan-section"><h3>疾病對應</h3><div class="license-disease-tags">${(p.disease_keys||[]).map(d=>`<span class="badge">${esc(diseaseLabelByName(d))}</span>`).join("")}</div></section>
    <section class="taiwan-section"><h3>停藥期</h3><p>本版未自行填入。官方網頁檢索結果頁未提供足夠欄位可安全整理停藥期，請以產品標籤／仿單及獸醫師指示確認。</p></section>
    <a class="primary license-official-link" href="${p.url}" target="_blank" rel="noopener">開啟官方許可證頁面</a>
  `;
  $("#licenseDialog").showModal();
};
$("#closeLicenseDialog").onclick=()=>$("#licenseDialog").close();

window.openLicensesForDisease=(disease)=>{
  switchTab("licenses");
  $("#licenseSearch").value="";
  $("#licenseCategory").value="";
  $("#licenseDiseaseFilter").value=disease;
  renderLicenseGrid();
  $("#licenseGrid").scrollIntoView({behavior:"smooth",block:"start"});
};
initLicenseDiseaseFilter();
renderLicenseGrid();

/* ---------- V10 Taiwan Current Practice Layer ---------- */
function taiwanProfileEntries(){
  return Object.entries(taiwanPractice.profiles||{});
}
function renderTaiwanPractice(){
  if(!$("#taiwanDiseaseList"))return;
  const buildMeta=document.querySelector('meta[name="app-build"]')?.content||APP_VERSION;
  const hasV23Data=Array.isArray(taiwanPractice.evidence_legend) && !!taiwanPractice.prrs_dynamics && Array.isArray(taiwanPractice.emerging_pathogens);
  const taiwanPanel=$("#tab-taiwan");
  let compat=taiwanPanel?.querySelector(".taiwan-version-warning");
  if(!hasV23Data && taiwanPanel && !compat){
    compat=document.createElement("div");
    compat.className="taiwan-version-warning taiwan-alert";
    compat.innerHTML=`<b>資料版本尚未同步：</b>畫面版本 ${esc(buildMeta)} 已載入，但台灣情報資料仍是舊快取。請重新整理一次；若仍存在，使用 Ctrl+F5 強制更新。`;
    taiwanPanel.insertBefore(compat,taiwanPanel.children[1]||null);
  }else if(hasV23Data && compat){
    compat.remove();
  }
  const recent=taiwanPractice.recent_updates||[];
  if($("#taiwanRecentAsOf"))$("#taiwanRecentAsOf").textContent=`核對至 ${taiwanPractice.as_of||"—"}`;
  if($("#taiwanRecentUpdates")){
    $("#taiwanRecentUpdates").innerHTML=recent.length?recent.map(x=>`
      <article class="taiwan-recent-item">
        <div class="taiwan-recent-top">
          <span class="badge ${x.level==="重要"?"priority-high":x.level==="注意"?"priority-med":""}">${esc(x.level||"更新")}</span>
          <time>${esc(x.date||"")}</time>
        </div>
        <h4>${esc(x.title||"")}</h4>
        <p>${esc(x.summary||"")}</p>
        ${x.interpretation?`<div class="taiwan-interpretation">${esc(x.interpretation)}</div>`:""}
        ${x.url?`<a class="secondary official-source-btn" href="${x.url}" target="_blank" rel="noopener">官方來源</a>`:""}
      </article>`).join(""):`<p class="muted">目前沒有近期官方更新。</p>`;
  }

  const evidence=taiwanPractice.evidence_legend||[];
  if($("#taiwanEvidenceLegend")){
    $("#taiwanEvidenceLegend").innerHTML=evidence.map(x=>`
      <div class="evidence-legend-item evidence-${esc(x.key)}">
        <span class="badge">${esc(x.label)}</span>
        <span>${esc(x.description||"")}</span>
      </div>`).join("");
  }

  const prrs=taiwanPractice.prrs_dynamics||{};
  if($("#taiwanPrrsSummary")){
    $("#taiwanPrrsSummary").innerHTML=prrs.summary?`<div class="taiwan-prrs-hero">${esc(prrs.summary)}</div>`:"";
  }
  if($("#taiwanPrrsDynamics")){
    $("#taiwanPrrsDynamics").innerHTML=(prrs.items||[]).map(x=>{
      const label=(evidence.find(e=>e.key===x.evidence)||{}).label||x.evidence||"資料";
      return `<article class="taiwan-intel-item evidence-${esc(x.evidence||"")}">
        <div class="taiwan-intel-head">
          <span class="badge">${esc(label)}</span>
          <h4>${esc(x.title||"")}</h4>
        </div>
        <p>${esc(x.detail||"")}</p>
        <div class="taiwan-intel-source">${esc(x.source_label||"")}</div>
        ${x.url?`<a class="secondary official-source-btn" href="${x.url}" target="_blank" rel="noopener">查看來源</a>`:""}
      </article>`;
    }).join("");
  }
  if($("#taiwanPrrsManagement")){
    $("#taiwanPrrsManagement").innerHTML=(prrs.management_points||[]).length
      ?`<h4>牧場管理重點</h4><ul>${prrs.management_points.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"";
  }

  if($("#taiwanEmergingPathogens")){
    $("#taiwanEmergingPathogens").innerHTML=(taiwanPractice.emerging_pathogens||[]).map(x=>{
      const label=(evidence.find(e=>e.key===x.evidence)||{}).label||x.evidence||"資料";
      return `<article class="taiwan-emerging-item evidence-${esc(x.evidence||"")}">
        <div class="taiwan-intel-head">
          <span class="badge">${esc(label)}</span>
          <h4>${esc(x.name||"")}${x.abbr?`（${esc(x.abbr)}）`:""}</h4>
        </div>
        <div class="taiwan-emerging-meta">
          <span>${esc(x.source_date||"")}</span>
          <span>${esc(x.source||"")}</span>
          <span>${esc(x.population||"")}</span>
        </div>
        <p><b>課堂／田間訊息：</b>${esc(x.finding||"")}</p>
        <div class="taiwan-current-alert">${esc(x.interpretation||"")}</div>
        <p><b>臨床用途：</b>${esc(x.clinical_use||"")}</p>
        <p class="muted">${esc(x.system_note||"")}</p>
        ${x.profile?`<button class="primary" onclick="openEmergingPathogen('${esc(x.abbr||x.name||"")}')">查看疾病介紹</button>`:""}
      </article>`;
    }).join("");
  }

  const loc=taiwanPractice.local_authority||{};
  $("#taiwanLocalContact").innerHTML=[
    ["單位",loc.name||"—"],
    ["總機",loc.main_phone||"—"],
    ["行動代表號",loc.mobile||"—"],
    ["非洲豬瘟通報專線",loc.asf_hotline||"—"],
    ["地址",loc.address||"—"],
    ["官方資料說明",loc.note||"—"]
  ].map(([k,v])=>`<div class="taiwan-contact-line"><b>${esc(k)}：</b>${esc(v)}</div>`).join("");

  const gen=taiwanPractice.general||{};
  $("#taiwanGeneralRules").innerHTML=[
    gen.reporting||"",
    gen.national_hotline?`動物防疫免付費諮詢專線：${gen.national_hotline}`:"",
    gen.monitoring_note||"",
    gen.drug_note||"",
    "原書中的藥物、疫苗與方劑只保留作為來源資料，不自動轉成台灣處置建議。",
    "沒有台灣官方來源支持的疾病，本版不自行填入法定通報、疫苗或藥物結論。"
  ].filter(Boolean).map(x=>`<div class="taiwan-rule">${esc(x)}</div>`).join("");

  const q=normalize($("#taiwanSearch")?.value||"");
  const arr=taiwanProfileEntries().filter(([name,p])=>{
    if(!q)return true;
    return normalize([name,p.display_name,p.legal_status,p.taiwan_status,p.current_alert].join(" ")).includes(q);
  });
  $("#taiwanDiseaseList").innerHTML=arr.length?arr.map(([name,p])=>`
    <article class="taiwan-disease-card">
      <div><span class="badge ${p.priority==="最高"?"priority-high":"priority-med"}">${esc(p.priority||"")}</span></div>
      <h4>${esc(p.display_name||name)}</h4>
      <p>${esc(p.taiwan_status||"")}</p>
      ${p.current_alert?`<div class="taiwan-current-alert">${esc(p.current_alert)}</div>`:""}
      <button class="primary" onclick="openTaiwanDisease('${esc(name)}')">查看台灣現行資料</button>
    </article>`).join(""):`<p class="muted">找不到符合的台灣現行疾病資料。</p>`;
}
$("#taiwanSearch")?.addEventListener("input",renderTaiwanPractice);

window.openEmergingPathogen=(key)=>{
  const x=(taiwanPractice.emerging_pathogens||[]).find(item=>item.abbr===key||item.name===key);
  if(!x?.profile)return;
  const p=x.profile;
  $("#emergingPathogenMeta").textContent=`台灣新興病原 · ${x.source_date||""} · ${x.source||""}`;
  $("#emergingPathogenTitle").textContent=`${x.name||""}${x.english?`｜${x.english}`:""}${x.abbr?`（${x.abbr}）`:""}`;
  const list=(title,items)=>items?.length?`<section class="taiwan-section"><h3>${esc(title)}</h3><ul>${items.map(v=>`<li>${esc(v)}</li>`).join("")}</ul></section>`:"";
  const src=(p.sources||[]).map(x=>`<a href="${x.url}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join("");
  $("#emergingPathogenBody").innerHTML=`
    <section class="taiwan-section emerging-highlight"><h3>台灣近期訊息</h3><p>${esc(p.taiwan_note||"")}</p></section>
    <section class="taiwan-section"><h3>疾病概述</h3><p>${esc(p.overview||"")}</p></section>
    <section class="taiwan-section"><h3>病原</h3><p>${esc(p.pathogen||"")}</p></section>
    <section class="taiwan-section"><h3>流行病學／傳播</h3><p>${esc(p.epidemiology||"")}</p></section>
    <section class="taiwan-section"><h3>好發日齡</h3><p>${esc(p.age_risk||"")}</p></section>
    <section class="taiwan-section"><h3>臨床症狀</h3><p>${esc(p.clinical||"")}</p></section>
    <section class="taiwan-section"><h3>病理變化</h3><p>${esc(p.pathology||"")}</p></section>
    <section class="taiwan-section"><h3>診斷</h3><p>${esc(p.diagnosis||"")}</p></section>
    ${list("建議採樣",p.sampling)}
    ${list("鑑別診斷",p.differentials)}
    <section class="taiwan-section"><h3>治療定位</h3><p>${esc(p.treatment||"")}</p></section>
    ${list("防治重點",p.control)}
    <section class="taiwan-section taiwan-alert-section"><h3>結果判讀提醒</h3><p>${esc(p.interpretation||"")}</p></section>
    <section class="taiwan-section"><h3>資料來源</h3><div class="source-links">${src||"<span class='muted'>無公開來源</span>"}</div></section>
  `;
  $("#emergingPathogenDialog").showModal();
};
$("#closeEmergingPathogenDialog")?.addEventListener("click",()=>$("#emergingPathogenDialog").close());

window.openTaiwanDisease=(name)=>{
  const p=taiwanPractice.profiles?.[name];if(!p)return;
  $("#taiwanDialogMeta").textContent=`台灣現行資料 · 核對日 ${taiwanPractice.as_of||""}`;
  $("#taiwanDialogTitle").textContent=p.display_name||name;
  const src=(p.sources||[]).map(x=>`<a href="${x.url}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join("");
  $("#taiwanDialogBody").innerHTML=`
    <section class="taiwan-section"><h3>法規／防疫定位</h3><p>${esc(p.legal_status||"未建立")}</p></section>
    <section class="taiwan-section"><h3>台灣目前狀態</h3><p>${esc(p.taiwan_status||"未建立")}</p></section>
    ${p.current_alert?`<section class="taiwan-section taiwan-alert-section"><h3>近期注意事項</h3><p>${esc(p.current_alert)}</p></section>`:""}
    <section class="taiwan-section"><h3>疫苗</h3><p>${esc(p.vaccine||"本版未建立")}</p></section>
    <section class="taiwan-section"><h3>治療定位</h3><p>${esc(p.treatment||"本版未建立")}</p></section>
    <section class="taiwan-section"><h3>現場優先處置</h3><ul>${(p.farm_action||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>
    <section class="taiwan-section"><h3>採樣／檢驗</h3><p>${esc(p.sampling||"本版未建立")}</p></section>
    <section class="taiwan-section"><h3>官方來源</h3><div class="source-links">${src||"<span class='muted'>無</span>"}</div></section>
  `;
  $("#taiwanDiseaseDialog").showModal();
};
$("#closeTaiwanDialog").onclick=()=>$("#taiwanDiseaseDialog").close();

renderTaiwanPractice();





/* ---------- V15 Antimicrobial Use & Resistance Monitor ---------- */
function isoDateObj(v){
  const d=new Date((v||"")+"T00:00:00");
  return Number.isNaN(d.getTime())?null:d;
}
function amrRangeStart(){
  const v=$("#amrRange")?.value||"365";
  if(v==="all") return null;
  const d=isoDateObj(todayLocal()); d.setDate(d.getDate()-Number(v)+1); return d;
}
function dateInAmrRange(date){
  const d=isoDateObj(date); if(!d)return false;
  const start=amrRangeStart(), end=isoDateObj(todayLocal());
  return (!start||d>=start)&&d<=end;
}
function overlapTreatmentDays(t){
  const s=isoDateObj(t.startDate); if(!s)return 0;
  const today=isoDateObj(todayLocal());
  let e=isoDateObj(t.endDate)||today;
  if(e>today)e=today;
  const rs=amrRangeStart();
  const a=rs&&s<rs?rs:s;
  if(e<a)return 0;
  return Math.floor((e-a)/86400000)+1;
}
function knownAntimicrobialCanon(t){
  const raw=t.ingredient||"";
  if(!raw)return "";
  const canon=astCanonicalIngredient(raw);
  const known=new Set(licenseProducts().filter(p=>p.category==="抗菌藥").flatMap(p=>licenseIngredientCanon(p)));
  return known.has(canon)?canon:"";
}
function ingredientDisplayName(canon){
  const labels={
    florfenicol:"Florfenicol",tilmicosin:"Tilmicosin",tiamulin:"Tiamulin",
    tylvalosin:"Tylvalosin",amoxicillin:"Amoxicillin",tulathromycin:"Tulathromycin",
    sulfamonomethoxine:"Sulfamonomethoxine",trimethoprim:"Trimethoprim"
  };
  return labels[canon]||canon||"未分類";
}
function amrTreatmentRows(){
  return treatmentPlans.map(t=>{
    const canon=knownAntimicrobialCanon(t);
    if(!canon)return null;
    const c=trackedCaseById(t.caseId);
    const days=overlapTreatmentDays(t);
    if(days<=0)return null;
    return {
      id:t.id,caseId:t.caseId,caseName:c?.name||"未連結病例",
      barn:c?.barn||"未填棟舍",pen:c?.pen||"",disease:caseDiseaseName(c||{}),
      canon,ingredient:ingredientDisplayName(canon),product:t.product||"",
      startDate:t.startDate||"",endDate:t.endDate||"",days,outcome:t.outcome||"active"
    };
  }).filter(Boolean);
}
function amrAstRows(){
  const rows=[];
  labOrders.forEach(o=>{
    const c=trackedCaseById(o.caseId);
    (o.results||[]).forEach(r=>{
      if(!(r.method==="藥物敏感性"||r.astDrug||r.astInterpretation))return;
      if(!dateInAmrRange(r.date||o.sampleDate))return;
      const canon=astCanonicalIngredient(r.astDrug||r.target||"");
      if(!canon)return;
      rows.push({
        orderId:o.id,caseId:o.caseId,caseName:c?.name||o.name||"未連結病例",
        barn:c?.barn||"未填棟舍",disease:caseDiseaseName(c||{}),
        date:r.date||o.sampleDate||"",canon,ingredient:ingredientDisplayName(canon),
        interpretation:r.astInterpretation||"NA",organism:r.astOrganism||r.target||"",
        mic:r.astMic||"",standard:r.astStandard||"",sampleRef:r.astSampleRef||""
      });
    });
  });
  return rows;
}
function amrSelectedIngredient(){
  return $("#amrIngredientFilter")?.value||"";
}
function refreshAmrIngredientFilter(){
  const sel=$("#amrIngredientFilter");if(!sel)return;
  const cur=sel.value;
  const vals=[...new Set([...amrTreatmentRows().map(x=>x.canon),...amrAstRows().map(x=>x.canon)])].filter(Boolean).sort();
  sel.innerHTML='<option value="">全部有效成分</option>';
  vals.forEach(c=>sel.insertAdjacentHTML("beforeend",`<option value="${esc(c)}">${esc(ingredientDisplayName(c))}</option>`));
  if([...sel.options].some(o=>o.value===cur))sel.value=cur;
}
function amrFilteredRows(){
  const ing=amrSelectedIngredient();
  return {
    treatments:amrTreatmentRows().filter(x=>!ing||x.canon===ing),
    asts:amrAstRows().filter(x=>!ing||x.canon===ing)
  };
}
function amrIngredientStats(treatments,asts){
  const keys=[...new Set([...treatments.map(x=>x.canon),...asts.map(x=>x.canon)])];
  return keys.map(c=>{
    const ts=treatments.filter(x=>x.canon===c), as=asts.filter(x=>x.canon===c);
    const counts={S:0,I:0,R:0,NA:0};
    as.forEach(x=>counts[x.interpretation||"NA"]=(counts[x.interpretation||"NA"]||0)+1);
    const sir=counts.S+counts.I+counts.R;
    return {
      canon:c,ingredient:ingredientDisplayName(c),
      uses:ts.length,days:ts.reduce((n,x)=>n+x.days,0),
      barns:new Set(ts.map(x=>x.barn)).size,
      S:counts.S,I:counts.I,R:counts.R,NA:counts.NA,
      sir,rPct:sir?counts.R/sir*100:null
    };
  }).sort((a,b)=>b.days-a.days||b.uses-a.uses);
}
function renderAmrMonitor(){
  if(!$("#amrUsageTable"))return;
  refreshAmrIngredientFilter();
  const {treatments,asts}=amrFilteredRows();
  const stats=amrIngredientStats(treatments,asts);
  const totalDays=treatments.reduce((n,x)=>n+x.days,0);
  const sirCount=asts.filter(x=>["S","I","R"].includes(x.interpretation)).length;
  const rCount=asts.filter(x=>x.interpretation==="R").length;
  const barns=new Set(treatments.map(x=>x.barn)).size;

  $("#amrKpis").innerHTML=[
    ["抗菌藥方案",treatments.length,"件","目前期間"],
    ["紀錄使用天數",totalDays,"天","方案日期區間重疊天數"],
    ["涉及棟舍",barns,"處",""],
    ["有 S/I/R 藥敏",sirCount,"筆","結構化紀錄"],
    ["R 紀錄",rCount,"筆",sirCount?`R 比例 ${(rCount/sirCount*100).toFixed(0)}%`:"無分母"]
  ].map(([k,v,u,sub])=>`<div class="dashboard-kpi"><span>${esc(k)}</span><b>${esc(String(v))}${esc(u)}</b><small>${esc(sub)}</small></div>`).join("");

  $("#amrUsageTable").innerHTML=stats.length?`<table class="dashboard-table"><thead><tr>
    <th>有效成分</th><th>方案數</th><th>紀錄使用天數</th><th>棟舍數</th><th>S</th><th>I</th><th>R</th><th>R 比例*</th>
  </tr></thead><tbody>${stats.map(x=>`<tr>
    <td><b>${esc(x.ingredient)}</b></td><td>${x.uses}</td><td>${x.days}</td><td>${x.barns}</td>
    <td>${x.S}</td><td>${x.I}</td><td>${x.R}</td>
    <td>${x.rPct===null?"—":`<span class="amr-metric ${x.rPct>=50&&x.sir>=3?"amr-risk-high":x.rPct>=25&&x.sir>=3?"amr-risk-mid":"amr-risk-low"}">${x.rPct.toFixed(0)}%</span>`}
      <div class="history-note">${x.sir?`n=${x.sir}`:"無 S/I/R"}</div></td>
  </tr>`).join("")}</tbody></table><p class="history-note">* R 比例為已輸入的 S/I/R 藥敏紀錄中 R 的比例，不代表牧場或區域正式抗藥性盛行率。</p>`:`<p class="muted">目前期間沒有可辨識的抗菌藥治療方案或藥敏資料。</p>`;

  renderAmrSir(stats);
  renderAmrBarnSignals(treatments);
  renderAmrAlerts(treatments,asts,stats);
  renderAmrTrend(asts);
  renderAmrDetails(treatments,asts);
}
function renderAmrSir(stats){
  $("#amrSirDist").innerHTML=stats.length?stats.map(x=>{
    const total=x.S+x.I+x.R+x.NA;
    const pct=v=>total?Math.round(v/total*100):0;
    return `<div class="amr-sir-row">
      <div class="amr-sir-head"><b>${esc(x.ingredient)}</b><span>${total} 筆</span></div>
      <div class="amr-sir-bar"><span class="amr-sir-s" style="width:${pct(x.S)}%"></span><span class="amr-sir-i" style="width:${pct(x.I)}%"></span><span class="amr-sir-r" style="width:${pct(x.R)}%"></span><span class="amr-sir-na" style="width:${pct(x.NA)}%"></span></div>
      <div class="history-note">S ${x.S} · I ${x.I} · R ${x.R} · 未判讀 ${x.NA}</div>
    </div>`;
  }).join(""):`<p class="muted">沒有藥敏資料。</p>`;
}
function renderAmrBarnSignals(treatments){
  const map=new Map();
  treatments.forEach(x=>{
    const key=`${x.barn}|||${x.canon}`;
    if(!map.has(key))map.set(key,{barn:x.barn,canon:x.canon,rows:[]});
    map.get(key).rows.push(x);
  });
  const signals=[...map.values()].filter(g=>g.rows.length>=2).sort((a,b)=>b.rows.length-a.rows.length).slice(0,12);
  $("#amrBarnSignals").innerHTML=signals.length?signals.map(g=>{
    const dates=g.rows.map(x=>x.startDate).filter(Boolean).sort();
    return `<div class="cross-signal"><b>${esc(g.barn)}｜${esc(ingredientDisplayName(g.canon))}</b>
      <div>${g.rows.length} 個方案 · ${g.rows.reduce((n,x)=>n+x.days,0)} 個紀錄使用日</div>
      <small class="muted">${esc(dates[0]||"")} ${dates.length>1?`～ ${esc(dates[dates.length-1])}`:""}</small>
    </div>`;
  }).join(""):`<p class="muted">目前沒有同一棟舍重複使用同成分的明顯訊號。</p>`;
}
function renderAmrAlerts(treatments,asts,stats){
  const alerts=[];
  stats.forEach(x=>{
    if(x.sir>=3&&x.rPct>=50)alerts.push({kind:"danger",text:`${x.ingredient}：目前已輸入的 S/I/R 藥敏紀錄中，R 為 ${x.R}/${x.sir}（${x.rPct.toFixed(0)}%）。請優先回看菌種、樣本來源、判讀標準與近期使用紀錄。`});
  });
  const totalDays=treatments.reduce((n,x)=>n+x.days,0);
  stats.forEach(x=>{
    if(totalDays>=10&&x.days/totalDays>=0.5&&x.uses>=2)alerts.push({kind:"warn",text:`${x.ingredient} 佔目前期間已記錄抗菌藥使用天數的 ${(x.days/totalDays*100).toFixed(0)}%。這是集中使用訊號，建議搭配藥敏與病例結果檢視。`});
  });
  const grouped=new Map();
  treatments.forEach(x=>{
    const key=`${x.barn}|||${x.canon}`;
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push(x);
  });
  [...grouped.values()].forEach(rows=>{
    if(rows.length>=3)alerts.push({kind:"warn",text:`${rows[0].barn} 在目前期間有 ${rows.length} 個 ${ingredientDisplayName(rows[0].canon)} 治療方案，建議檢查是否為反覆病例、不同批次，或同一事件被重複建檔。`});
  });
  if(!alerts.length)alerts.push({kind:"ok",text:"目前沒有達到系統設定門檻的 R 集中或重複使用訊號。資料量少時不能解讀為抗藥性風險低。"});
  $("#amrAlerts").innerHTML=alerts.slice(0,8).map(a=>`<div class="dashboard-alert ${a.kind}">${esc(a.text)}</div>`).join("");
}
function monthKey(date){
  return String(date||"").slice(0,7);
}
function renderAmrTrend(asts){
  const valid=asts.filter(x=>["S","I","R"].includes(x.interpretation)&&x.date);
  const map=new Map();
  valid.forEach(x=>{
    const m=monthKey(x.date);if(!m)return;
    if(!map.has(m))map.set(m,{S:0,I:0,R:0});
    map.get(m)[x.interpretation]++;
  });
  const months=[...map.keys()].sort();
  const ratios=months.map(m=>{
    const x=map.get(m),n=x.S+x.I+x.R;
    return n?x.R/n*100:0;
  });
  const canvas=$("#amrTrendChart");if(!canvas)return;
  const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1,w=Math.max(420,rect.width||900),h=240;
  canvas.width=w*ratio;canvas.height=h*ratio;canvas.style.height=h+"px";
  const ctx=canvas.getContext("2d");ctx.scale(ratio,ratio);ctx.clearRect(0,0,w,h);
  const pad={l:48,r:20,t:24,b:40},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
  ctx.strokeStyle="#cbd5e1";ctx.beginPath();ctx.moveTo(pad.l,pad.t);ctx.lineTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
  ctx.font="11px sans-serif";ctx.fillStyle="#64748b";
  for(let k=0;k<=4;k++){const val=(4-k)*25,yy=pad.t+ph*k/4;ctx.textAlign="right";ctx.fillText(val+"%",pad.l-6,yy+4);ctx.strokeStyle="#eef2f7";ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();}
  if(!months.length){ctx.textAlign="left";ctx.fillText("尚無可計算的 S/I/R 月份資料",pad.l+10,pad.t+30);return;}
  const x=i=>pad.l+(months.length<=1?pw/2:i*pw/(months.length-1)), y=v=>pad.t+(100-v)*ph/100;
  ctx.strokeStyle="#b91c1c";ctx.lineWidth=2.5;ctx.beginPath();
  ratios.forEach((v,i)=>{if(i===0)ctx.moveTo(x(i),y(v));else ctx.lineTo(x(i),y(v));});ctx.stroke();
  ratios.forEach((v,i)=>{ctx.fillStyle="#b91c1c";ctx.beginPath();ctx.arc(x(i),y(v),3.5,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle="#64748b";ctx.textAlign="center";
  months.forEach((m,i)=>{if(months.length<=8||i%Math.ceil(months.length/8)===0)ctx.fillText(m,x(i),h-14);});
}
function renderAmrDetails(treatments,asts){
  const tx=treatments.map(x=>({type:"治療",date:x.startDate,ingredient:x.ingredient,barn:x.barn,caseName:x.caseName,detail:`${x.product||""} · ${x.days} 天 · ${treatmentOutcomeLabel(x.outcome)}`}));
  const ax=asts.map(x=>({type:"AST",date:x.date,ingredient:x.ingredient,barn:x.barn,caseName:x.caseName,detail:`${x.interpretation} · ${x.organism||"未填菌種"}${x.mic?` · ${x.mic}`:""}`}));
  const rows=[...tx,...ax].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  $("#amrDetailTable").innerHTML=rows.length?`<table class="dashboard-table"><thead><tr><th>日期</th><th>類型</th><th>有效成分</th><th>棟舍</th><th>病例</th><th>內容</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(r.type)}</td><td>${esc(r.ingredient)}</td><td>${esc(r.barn)}</td><td>${esc(r.caseName)}</td><td>${esc(r.detail)}</td></tr>`).join("")}</tbody></table>`:`<p class="muted">目前沒有明細資料。</p>`;
}
$("#amrRange")?.addEventListener("change",renderAmrMonitor);
$("#amrIngredientFilter")?.addEventListener("change",renderAmrMonitor);
$("#refreshAmr").onclick=renderAmrMonitor;
$("#exportAmrCsv").onclick=()=>{
  const {treatments,asts}=amrFilteredRows(),stats=amrIngredientStats(treatments,asts);
  const head=["有效成分","治療方案數","紀錄使用天數","棟舍數","S","I","R","未判讀","R比例%"];
  const body=stats.map(x=>[x.ingredient,x.uses,x.days,x.barns,x.S,x.I,x.R,x.NA,x.rPct===null?"":x.rPct.toFixed(1)]);
  const csv="\ufeff"+[head,...body].map(r=>r.map(csvEscape).join(",")).join("\n");
  downloadBlob(`抗菌藥與藥敏監測_${todayLocal()}.csv`,csv,"text/csv;charset=utf-8");
};
window.addEventListener("resize",()=>{if($("#tab-amr")?.classList.contains("active"))renderAmrTrend(amrFilteredRows().asts);});
renderAmrMonitor();

/* ---------- V14 Historical Treatment Outcome Analytics ---------- */
function dateDiffDays(a,b){
  const da=new Date((a||"")+"T00:00:00"), db=new Date((b||"")+"T00:00:00");
  if(Number.isNaN(da.getTime())||Number.isNaN(db.getTime())) return null;
  return Math.round((db-da)/86400000);
}
function treatmentAstState(t){
  const ctx=treatmentAstContext(t);
  if(!ctx.same.length) return "none";
  const vals=ctx.same.map(x=>x.result.astInterpretation||"NA");
  if(vals.includes("S")) return "S";
  if(vals.includes("I")) return "I";
  if(vals.includes("R")) return "R";
  return "NA";
}
function treatmentHistoryRecord(t){
  const c=trackedCaseById(t.caseId);
  const entries=treatmentLinkedEntries(t,c);
  const sig=treatmentAutoSignal(t,c);
  const reviews=(t.reviews||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const firstImproving=reviews.find(r=>r.assessment==="improving");
  let responseDays=null;
  if(firstImproving) responseDays=dateDiffDays(t.startDate,firstImproving.date);
  if(responseDays===null && sig.kind==="improving" && entries.length>=2){
    // Fallback: use the first date where sick decreases by >=20% or feed rises >=10 percentage points.
    const base=entries[0];
    const bs=numOrNull(base.sick), bf=numOrNull(base.feed);
    for(let i=1;i<entries.length;i++){
      const e=entries[i];
      const es=numOrNull(e.sick), ef=numOrNull(e.feed);
      const sickImproved=bs!==null&&bs>0&&es!==null&&((bs-es)/bs)>=0.2;
      const feedImproved=bf!==null&&ef!==null&&(ef-bf)>=10;
      if(sickImproved||feedImproved){ responseDays=dateDiffDays(t.startDate,e.date); break; }
    }
  }
  const first=entries[0]||null,last=entries.length?entries[entries.length-1]:null;
  const sickChange=(first&&last&&numOrNull(first.sick)!==null&&numOrNull(last.sick)!==null)
    ? numOrNull(last.sick)-numOrNull(first.sick):null;
  const feedChange=(first&&last&&numOrNull(first.feed)!==null&&numOrNull(last.feed)!==null)
    ? numOrNull(last.feed)-numOrNull(first.feed):null;
  const deaths=entries.reduce((n,e)=>n+(Number(e.deaths)||0),0);
  const disease=caseDiseaseName(c||{});
  const ingredient=t.ingredient||t.product||"未填有效成分";
  return {
    id:t.id, caseId:t.caseId, planName:t.name||"未命名方案",
    caseName:c?.name||"未連結病例", disease, ingredient, product:t.product||"",
    outcome:t.outcome||"active", autoKind:sig.kind, autoLabel:sig.label,
    astState:treatmentAstState(t), responseDays, sickChange, feedChange,
    deaths, startDate:t.startDate||"", endDate:t.endDate||"",
    barn:c?.barn||"", pen:c?.pen||""
  };
}
function allHistoryRecords(){
  return treatmentPlans.map(treatmentHistoryRecord);
}
function initHistoryFilters(){
  if(!$("#historyDiseaseFilter")) return;
  const records=allHistoryRecords();
  const diseaseSel=$("#historyDiseaseFilter"), ingSel=$("#historyIngredientFilter");
  const currentDisease=diseaseSel.value,currentIng=ingSel.value;
  diseaseSel.innerHTML='<option value="">全部疾病</option>';
  ingSel.innerHTML='<option value="">全部有效成分</option>';
  [...new Set(records.map(r=>r.disease).filter(Boolean))].sort().forEach(v=>diseaseSel.insertAdjacentHTML("beforeend",`<option>${esc(v)}</option>`));
  [...new Set(records.map(r=>r.ingredient).filter(Boolean))].sort().forEach(v=>ingSel.insertAdjacentHTML("beforeend",`<option>${esc(v)}</option>`));
  if([...diseaseSel.options].some(o=>o.value===currentDisease)) diseaseSel.value=currentDisease;
  if([...ingSel.options].some(o=>o.value===currentIng)) ingSel.value=currentIng;
}
function filteredHistoryRecords(){
  const disease=$("#historyDiseaseFilter")?.value||"";
  const ing=$("#historyIngredientFilter")?.value||"";
  const ast=$("#historyAstFilter")?.value||"";
  return allHistoryRecords().filter(r=>(!disease||r.disease===disease)&&(!ing||r.ingredient===ing)&&(!ast||r.astState===ast));
}
function historyGroupRows(records){
  const map=new Map();
  records.forEach(r=>{
    const key=`${r.disease}|||${r.ingredient}`;
    if(!map.has(key)) map.set(key,{disease:r.disease,ingredient:r.ingredient,rows:[]});
    map.get(key).rows.push(r);
  });
  return [...map.values()].map(g=>{
    const rows=g.rows,n=rows.length;
    const improving=rows.filter(r=>r.outcome==="improving"||r.autoKind==="improving").length;
    const worsening=rows.filter(r=>r.outcome==="worsening"||r.autoKind==="worsening").length;
    const noresp=rows.filter(r=>r.outcome==="no_response"||r.autoKind==="no_response").length;
    const responseVals=rows.map(r=>r.responseDays).filter(v=>v!==null&&Number.isFinite(v)&&v>=0);
    const avgResponse=responseVals.length?responseVals.reduce((a,b)=>a+b,0)/responseVals.length:null;
    const sickVals=rows.map(r=>r.sickChange).filter(v=>v!==null&&Number.isFinite(v));
    const avgSick=sickVals.length?sickVals.reduce((a,b)=>a+b,0)/sickVals.length:null;
    const feedVals=rows.map(r=>r.feedChange).filter(v=>v!==null&&Number.isFinite(v));
    const avgFeed=feedVals.length?feedVals.reduce((a,b)=>a+b,0)/feedVals.length:null;
    const astS=rows.filter(r=>r.astState==="S").length;
    return {disease:g.disease,ingredient:g.ingredient,n,improving,worsening,noresp,avgResponse,avgSick,avgFeed,astS,rows};
  });
}
function renderHistoryAnalysis(){
  if(!$("#historyGroupTable"))return;
  initHistoryFilters();
  const records=filteredHistoryRecords();
  const minCases=Number($("#historyMinCases")?.value||1);
  const groups=historyGroupRows(records).filter(g=>g.n>=minCases).sort((a,b)=>{
    const ar=a.n? a.improving/a.n:0, br=b.n?b.improving/b.n:0;
    return br-ar || b.n-a.n;
  });
  const completed=records.filter(r=>r.outcome!=="active").length;
  const improved=records.filter(r=>r.outcome==="improving"||r.autoKind==="improving").length;
  const worsened=records.filter(r=>r.outcome==="worsening"||r.autoKind==="worsening").length;
  const responseVals=records.map(r=>r.responseDays).filter(v=>v!==null&&Number.isFinite(v)&&v>=0);
  const avgResponse=responseVals.length?responseVals.reduce((a,b)=>a+b,0)/responseVals.length:null;

  $("#historyKpis").innerHTML=[
    ["治療方案",records.length,"件","目前篩選"],
    ["已結束／有判讀",completed,"件","非進行中"],
    ["改善紀錄",improved,"件","含人工或量化訊號"],
    ["惡化紀錄",worsened,"件","含人工或量化訊號"],
    ["平均開始改善",avgResponse===null?"—":avgResponse.toFixed(1),"天","有可計算資料者"]
  ].map(([k,v,u,sub])=>`<div class="dashboard-kpi"><span>${esc(k)}</span><b>${esc(String(v))}${esc(u)}</b><small>${esc(sub)}</small></div>`).join("");

  $("#historyGroupTable").innerHTML=groups.length?`<table class="dashboard-table"><thead><tr>
    <th>疾病</th><th>有效成分</th><th>案例數</th><th>改善率*</th><th>惡化</th><th>S 藥敏</th><th>平均改善天數</th><th>平均病豬變化</th><th>平均採食變化</th>
  </tr></thead><tbody>${groups.map(g=>{
    const rate=g.n?Math.round(g.improving/g.n*100):0;
    return `<tr>
      <td>${esc(g.disease)}</td><td>${esc(g.ingredient)}</td><td>${g.n}</td>
      <td><span class="history-score ${rate>=60?"history-good":rate<30?"history-bad":"history-neutral"}">${rate}%</span><div class="history-note">歷史紀錄比例，非藥物因果療效</div></td>
      <td>${g.worsening}</td><td>${g.astS}</td>
      <td>${g.avgResponse===null?"—":g.avgResponse.toFixed(1)+" 天"}</td>
      <td>${g.avgSick===null?"—":(g.avgSick>0?"+":"")+g.avgSick.toFixed(1)+" 頭"}</td>
      <td>${g.avgFeed===null?"—":(g.avgFeed>0?"+":"")+g.avgFeed.toFixed(1)+"%"}</td>
    </tr>`;
  }).join("")}</tbody></table>`:`<p class="muted">目前資料不足，尚無符合條件的歷史群組。</p>`;

  const responseGroups=groups.filter(g=>g.avgResponse!==null).sort((a,b)=>a.avgResponse-b.avgResponse).slice(0,10);
  const maxResponse=Math.max(1,...responseGroups.map(g=>g.avgResponse||0));
  $("#historyResponseTime").innerHTML=responseGroups.length?responseGroups.map(g=>`
    <div class="dist-item"><b>${esc(g.disease)}｜${esc(g.ingredient)}</b><div>${g.avgResponse.toFixed(1)} 天 · ${g.n} 次</div><div class="dist-bar"><span style="width:${Math.max(5,Math.round(g.avgResponse/maxResponse*100))}%"></span></div></div>`).join(""):`<p class="muted">尚無足夠資料計算改善天數。</p>`;

  const failures=records.filter(r=>r.outcome==="worsening"||r.outcome==="stopped"||r.autoKind==="worsening").sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate))).slice(0,10);
  $("#historyFailures").innerHTML=failures.length?failures.map(r=>`
    <div class="cross-signal">
      <b>${esc(r.caseName)}｜${esc(r.ingredient)}</b>
      <div>${esc(r.disease)} · ${esc(r.startDate)} · ${esc(treatmentOutcomeLabel(r.outcome))}</div>
      <small class="muted">藥敏 ${esc(r.astState)} · 治療期死亡 ${r.deaths} 頭${r.sickChange!==null?` · 病豬變化 ${r.sickChange>0?"+":""}${r.sickChange}`:""}</small>
    </div>`).join(""):`<p class="muted">目前沒有惡化／停止方案紀錄。</p>`;

  $("#historyCaseTable").innerHTML=records.length?`<table class="dashboard-table"><thead><tr>
    <th>病例</th><th>疾病</th><th>產品／成分</th><th>AST</th><th>方案結果</th><th>量化訊號</th><th>改善天數</th><th>死亡</th><th></th>
  </tr></thead><tbody>${records.sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate))).map(r=>`
    <tr class="history-case-row">
      <td>${esc(r.caseName)}<br><span class="case-card-time">${esc([r.barn,r.pen].filter(Boolean).join("/")||"")}</span></td>
      <td>${esc(r.disease)}</td><td>${esc([r.product,r.ingredient].filter(Boolean).join(" / "))}</td>
      <td>${esc(r.astState)}</td><td>${esc(treatmentOutcomeLabel(r.outcome))}</td><td>${esc(r.autoLabel)}</td>
      <td>${r.responseDays===null?"—":r.responseDays+" 天"}</td><td>${r.deaths}</td>
      <td><button class="secondary" onclick="openHistoryTreatment('${r.id}')">開啟</button></td>
    </tr>`).join("")}</tbody></table>`:`<p class="muted">目前尚無治療歷史資料。</p>`;
}
window.openHistoryTreatment=(id)=>{
  activeTreatmentPlanId=id;switchTab("treatment");renderTreatmentPlans();renderTreatmentDetail();
};

["#historyDiseaseFilter","#historyIngredientFilter","#historyAstFilter","#historyMinCases"].forEach(sel=>{
  const el=$(sel); if(el) el.addEventListener("change",renderHistoryAnalysis);
});
$("#refreshHistoryAnalysis").onclick=renderHistoryAnalysis;
$("#exportHistoryCsv").onclick=()=>{
  const rows=historyGroupRows(filteredHistoryRecords());
  const head=["疾病","有效成分","案例數","改善數","惡化數","無明顯反應數","S藥敏數","平均改善天數","平均病豬變化","平均採食變化"];
  const body=rows.map(g=>[g.disease,g.ingredient,g.n,g.improving,g.worsening,g.noresp,g.astS,g.avgResponse??"",g.avgSick??"",g.avgFeed??""]);
  const csv="\ufeff"+[head,...body].map(r=>r.map(csvEscape).join(",")).join("\n");
  downloadBlob(`牧場歷史治療成效_${todayLocal()}.csv`,csv,"text/csv;charset=utf-8");
};
renderHistoryAnalysis();

/* ---------- V13 Treatment Outcome Loop ---------- */
function saveTreatmentPlans(){
  localStorage.setItem("pigTreatmentPlans",JSON.stringify(treatmentPlans)); markLocalChanged();
}
function treatmentById(id){
  return treatmentPlans.find(x=>String(x.id)===String(id));
}
function treatmentOutcomeLabel(v){
  const map={active:"進行中",improving:"改善",no_response:"無明顯反應",worsening:"惡化",stopped:"停止／改方案"};
  return map[v]||"進行中";
}
function treatmentOutcomeClass(v){
  return ["active","improving","no_response","worsening","stopped"].includes(v)?`outcome-${v}`:"outcome-active";
}
function refreshTreatmentCaseSelect(){
  const sel=$("#treatmentCaseSelect"); if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">選擇追蹤病例</option>';
  trackedCases.forEach(c=>sel.insertAdjacentHTML("beforeend",`<option value="${c.id}">${esc(c.name||"未命名病例")}｜${esc([c.barn,c.pen].filter(Boolean).join("/")||"未填棟舍")}</option>`));
  if([...sel.options].some(o=>o.value===cur)) sel.value=cur;
}
function treatmentSearchText(t){
  const c=trackedCaseById(t.caseId);
  return normalize([t.name,t.product,t.ingredient,t.route,t.vet,t.doseNote,t.envAction,t.goal,c?.name,c?.barn,c?.pen,caseDiseaseName(c||{})].join(" "));
}
function renderTreatmentKpis(){
  const counts={active:0,improving:0,no_response:0,worsening:0,stopped:0};
  treatmentPlans.forEach(t=>counts[t.outcome||"active"]=(counts[t.outcome||"active"]||0)+1);
  $("#treatmentKpis").innerHTML=[
    ["治療方案",treatmentPlans.length,"件","全部"],
    ["進行中",counts.active,"件",""],
    ["改善",counts.improving,"件",""],
    ["無明顯反應",counts.no_response,"件",""],
    ["惡化",counts.worsening,"件",""],
    ["停止／改方案",counts.stopped,"件",""]
  ].map(([k,v,u,sub])=>`<div class="dashboard-kpi"><span>${esc(k)}</span><b>${esc(String(v))}${esc(u)}</b><small>${esc(sub)}</small></div>`).join("");
}
function renderTreatmentPlans(){
  if(!$("#treatmentPlanList"))return;
  refreshTreatmentCaseSelect(); renderTreatmentKpis();
  const q=normalize($("#treatmentSearch").value||"");
  const f=$("#treatmentOutcomeFilter").value||"";
  let arr=treatmentPlans.slice().sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  arr=arr.filter(t=>(!f||t.outcome===f)&&(!q||treatmentSearchText(t).includes(q)));
  $("#treatmentPlanList").innerHTML=arr.length?arr.map(t=>{
    const c=trackedCaseById(t.caseId);
    return `<button class="treatment-plan-item ${String(activeTreatmentPlanId)===String(t.id)?"active":""}" onclick="selectTreatmentPlan('${t.id}')">
      <span class="outcome-pill ${treatmentOutcomeClass(t.outcome)}">${esc(treatmentOutcomeLabel(t.outcome))}</span>
      <h4>${esc(t.name||"未命名方案")}</h4>
      <p>${esc(c?.name||"未連結病例")}</p>
      <p>${esc([t.product,t.ingredient].filter(Boolean).join(" · ")||"未填產品／成分")}</p>
      <p>${esc(t.startDate||"")} ${t.endDate?`→ ${esc(t.endDate)}`:""}</p>
    </button>`;
  }).join(""):`<p class="muted">沒有符合條件的治療方案。</p>`;
  if(activeTreatmentPlanId && treatmentById(activeTreatmentPlanId)) renderTreatmentDetail();
  else {$("#treatmentDetail").classList.add("hidden");$("#treatmentEmpty").classList.remove("hidden");}
}
window.selectTreatmentPlan=(id)=>{
  activeTreatmentPlanId=id;renderTreatmentPlans();renderTreatmentDetail();
};
function linkedLabOrdersForTreatment(t){
  return labOrders.filter(o=>String(o.caseId)===String(t.caseId));
}
function treatmentAstContext(t){
  const orders=linkedLabOrdersForTreatment(t);
  const asts=orders.flatMap(o=>astResultsForOrder(o).map(r=>({order:o,result:r})));
  const canon=astCanonicalIngredient(t.ingredient||t.product||"");
  const same=asts.filter(x=>astCanonicalIngredient(x.result.astDrug||x.result.target||"")===canon);
  return {orders,asts,same,canon};
}
function renderTreatmentAst(t){
  const ctx=treatmentAstContext(t);
  if(!ctx.canon){
    $("#treatmentAstMatch").innerHTML=`<div class="notice">此方案尚未填有效成分，無法和藥敏結果比對。</div>`;return;
  }
  if(!ctx.same.length){
    $("#treatmentAstMatch").innerHTML=`<div class="notice">此病例已有的檢驗紀錄中，尚未找到和「${esc(t.ingredient||t.product)}」相同有效成分的結構化藥敏結果。</div>`;return;
  }
  $("#treatmentAstMatch").innerHTML=ctx.same.map(x=>{
    const r=x.result,cls=astMatchClass(r.astInterpretation);
    return `<div class="ast-match ${cls}">
      <div class="ast-match-head"><div><h4>${esc(r.astDrug||r.target||"藥敏")}</h4><div class="license-expiry">${esc(x.order.name||"送檢")} · ${esc(r.date||"")}</div></div>
      <span class="ast-pill ${cls}">${esc(astInterpretationLabel(r.astInterpretation))}</span></div>
      <div class="ast-reason">${esc([r.astOrganism,r.astMic,r.astStandard].filter(Boolean).join(" · ")||"")}</div>
    </div>`;
  }).join("");
}
function treatmentLinkedEntries(t,c){
  if(!c)return [];
  const start=t.startDate||c.startDate||"";
  const end=t.endDate||"9999-12-31";
  return (c.entries||[]).filter(e=>e.date>=start && e.date<=end).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function treatmentAutoSignal(t,c){
  const arr=treatmentLinkedEntries(t,c);
  if(arr.length<2)return {label:"資料不足",kind:"no_response",text:"至少需要治療期間內 2 筆病例追蹤紀錄，才能做趨勢比較。"};
  const first=arr[0],last=arr[arr.length-1];
  let score=0,parts=[];
  const fs=numOrNull(first.sick),ls=numOrNull(last.sick);
  if(fs!==null&&ls!==null&&fs>0){const d=(ls-fs)/fs;if(d<=-0.2){score+=2;parts.push("病豬下降")}else if(d>=0.2){score-=2;parts.push("病豬上升")}}
  const ff=numOrNull(first.feed),lf=numOrNull(last.feed);
  if(ff!==null&&lf!==null){if(lf-ff>=10){score+=2;parts.push("採食回升")}else if(ff-lf>=10){score-=2;parts.push("採食下降")}}
  const deaths=arr.slice(1).map(e=>Number(e.deaths)||0);
  if(deaths.length>=2){const half=Math.ceil(deaths.length/2),a=deaths.slice(0,half).reduce((x,y)=>x+y,0),b=deaths.slice(half).reduce((x,y)=>x+y,0);if(b<a){score+=1;parts.push("後段死亡下降")}else if(b>a){score-=1;parts.push("後段死亡增加")}}
  if(score>=2)return {label:"量化趨勢偏改善",kind:"improving",text:`依治療期間病例追蹤：${parts.join("、")||"整體指標改善"}。這不等於證明本方案造成改善。`};
  if(score<=-2)return {label:"量化趨勢偏惡化",kind:"worsening",text:`依治療期間病例追蹤：${parts.join("、")||"整體指標惡化"}。應重新檢視診斷、藥敏與管理處置。`};
  return {label:"量化趨勢無明顯變化",kind:"no_response",text:`目前變化不足以判定明顯改善；${parts.join("、")||"各項指標大致持平"}。`};
}
function renderTreatmentDetail(){
  const t=treatmentById(activeTreatmentPlanId);if(!t)return;
  const c=trackedCaseById(t.caseId);
  $("#treatmentEmpty").classList.add("hidden");$("#treatmentDetail").classList.remove("hidden");
  $("#treatmentMeta").textContent=`${treatmentOutcomeLabel(t.outcome)} · ${t.startDate||"未填開始日"}`;
  $("#treatmentTitle").textContent=t.name||"未命名方案";
  $("#treatmentBadges").innerHTML=[c?.name,caseDiseaseLabel(c||{}),t.product,t.ingredient].filter(Boolean).map(x=>`<span class="badge">${esc(x)}</span>`).join("");
  $("#treatmentOutcome").value=t.outcome||"active";

  const sig=treatmentAutoSignal(t,c);
  const reviews=t.reviews||[];
  $("#treatmentSummary").innerHTML=[
    ["量化趨勢",sig.label],
    ["開始日期",t.startDate||"—"],
    ["結束日期",t.endDate||"進行中"],
    ["評估筆數",reviews.length],
    ["關聯送檢",linkedLabOrdersForTreatment(t).length]
  ].map(([k,v])=>`<div class="treatment-summary-box"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join("");

  $("#treatmentPlanInfo").innerHTML=[
    ["關聯病例",c?.name||"—"],["疾病",caseDiseaseLabel(c||{})],["產品",t.product||"—"],["有效成分",t.ingredient||"—"],
    ["方式",t.route||"—"],["獸醫師／開立者",t.vet||"—"],["實際執行內容",t.doseNote||"—"],["環境／管理調整",t.envAction||"—"],["治療目標",t.goal||"—"],
    ["系統量化訊號",`${sig.label}｜${sig.text}`]
  ].map(([k,v])=>`<div><b>${esc(k)}：</b>${esc(v)}</div>`).join("");

  renderTreatmentAst(t);

  $("#treatmentReviewList").innerHTML=reviews.length?reviews.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map((r,i)=>`
    <article class="timeline-item">
      <div class="timeline-top"><div><div class="eyebrow">${esc(treatmentOutcomeLabel(r.assessment))}</div><h4>${esc(r.date||"")}</h4></div></div>
      <div class="timeline-metrics"><span class="badge">病豬 ${esc(String(r.sick??"—"))}</span><span class="badge">死亡 ${esc(String(r.deaths??"—"))}</span><span class="badge">採食 ${esc(r.feed!==null&&r.feed!==undefined?`${r.feed}%`:"—")}</span><span class="badge">體溫 ${esc(r.temp!==null&&r.temp!==undefined?`${r.temp}℃`:"—")}</span></div>
      ${r.note?`<div class="timeline-note">${esc(r.note)}</div>`:""}
    </article>`).join(""):`<p class="muted">尚未建立人工成效評估。</p>`;

  const entries=treatmentLinkedEntries(t,c);
  drawLineChart($("#treatmentHealthChart"),entries.map((e,i)=>`D${caseDayNumber(c,e.date)}`),[
    {name:"病豬頭數",values:entries.map(e=>numOrNull(e.sick))},
    {name:"採食 %",values:entries.map(e=>numOrNull(e.feed))}
  ]);
  drawBarChart($("#treatmentDeathChart"),entries.map((e,i)=>`D${caseDayNumber(c,e.date)}`),entries.map(e=>numOrNull(e.deaths)||0));
}
function prepareTreatmentPlan(caseId=null){
  refreshTreatmentCaseSelect();
  $("#treatmentCaseSelect").value=caseId?String(caseId):"";
  const c=caseId?trackedCaseById(caseId):null;
  $("#treatmentName").value=c?`${c.name} 治療方案`:"";
  $("#treatmentStartDate").value=todayLocal();
  $("#treatmentEndDate").value="";
  $("#treatmentProduct").value="";
  $("#treatmentIngredient").value="";
  $("#treatmentRoute").value="";
  $("#treatmentVet").value="";
  $("#treatmentDoseNote").value="";
  $("#treatmentEnvAction").value="";
  $("#treatmentGoal").value="";
  $("#newTreatmentDialog").showModal();
}
$("#newTreatmentPlan").onclick=()=>prepareTreatmentPlan(null);
$("#closeTreatmentDialog").onclick=()=>$("#newTreatmentDialog").close();
$("#saveNewTreatment").onclick=()=>{
  const caseId=$("#treatmentCaseSelect").value||null;
  const t={
    id:Date.now(),caseId,
    name:$("#treatmentName").value.trim()||`治療方案 ${todayLocal()}`,
    startDate:$("#treatmentStartDate").value||todayLocal(),
    endDate:$("#treatmentEndDate").value,
    product:$("#treatmentProduct").value.trim(),
    ingredient:$("#treatmentIngredient").value.trim(),
    route:$("#treatmentRoute").value.trim(),
    vet:$("#treatmentVet").value.trim(),
    doseNote:$("#treatmentDoseNote").value.trim(),
    envAction:$("#treatmentEnvAction").value.trim(),
    goal:$("#treatmentGoal").value.trim(),
    outcome:"active",reviews:[],createdAt:Date.now(),updatedAt:Date.now()
  };
  treatmentPlans.unshift(t);saveTreatmentPlans();activeTreatmentPlanId=t.id;$("#newTreatmentDialog").close();switchTab("treatment");renderTreatmentPlans();renderTreatmentDetail();
};
window.createTreatmentFromCase=(caseId)=>{switchTab("treatment");prepareTreatmentPlan(caseId);};

$("#treatmentSearch").addEventListener("input",renderTreatmentPlans);
$("#treatmentOutcomeFilter").addEventListener("change",renderTreatmentPlans);
$("#treatmentOutcome").onchange=e=>{
  const t=treatmentById(activeTreatmentPlanId);if(!t)return;t.outcome=e.target.value;t.updatedAt=Date.now();saveTreatmentPlans();renderTreatmentPlans();renderTreatmentDetail();
};
$("#deleteTreatment").onclick=()=>{
  const t=treatmentById(activeTreatmentPlanId);if(!t)return;
  if(!confirm(`確定刪除治療方案「${t.name}」？`))return;
  treatmentPlans=treatmentPlans.filter(x=>String(x.id)!==String(t.id));saveTreatmentPlans();activeTreatmentPlanId=null;renderTreatmentPlans();
};
$("#printTreatment").onclick=()=>window.print();
$("#exportTreatmentJson").onclick=()=>downloadBlob(`豬病治療方案_${todayLocal()}.json`,JSON.stringify(treatmentPlans,null,2),"application/json;charset=utf-8");

$("#addTreatmentReview").onclick=()=>{
  $("#reviewDate").value=todayLocal();$("#reviewAssessment").value="";$("#reviewSick").value="";$("#reviewDeaths").value="";$("#reviewFeed").value="";$("#reviewTemp").value="";$("#reviewNote").value="";
  $("#treatmentReviewDialog").showModal();
};
$("#closeTreatmentReviewDialog").onclick=()=>$("#treatmentReviewDialog").close();
$("#saveTreatmentReview").onclick=()=>{
  const t=treatmentById(activeTreatmentPlanId);if(!t)return;
  t.reviews=t.reviews||[];
  t.reviews.push({date:$("#reviewDate").value||todayLocal(),assessment:$("#reviewAssessment").value||"no_response",sick:numOrNull($("#reviewSick").value),deaths:numOrNull($("#reviewDeaths").value),feed:numOrNull($("#reviewFeed").value),temp:numOrNull($("#reviewTemp").value),note:$("#reviewNote").value.trim()});
  t.updatedAt=Date.now();saveTreatmentPlans();$("#treatmentReviewDialog").close();renderTreatmentPlans();renderTreatmentDetail();
};

renderTreatmentPlans();

/* ---------- V12 AST × Taiwan License Matching ---------- */
const astIngredientAliases = {
  "florfenicol":["florfenicol","氟苯尼考","氟甲碸黴素"],
  "tilmicosin":["tilmicosin","tilmicosinphosphate","替米考星"],
  "tiamulin":["tiamulin","tiamulinhydrogenfumarate","泰妙菌素","延胡索酸泰妙菌素"],
  "tylvalosin":["tylvalosin","tylvalosintartrate","泰萬菌素","泰萬菌素"],
  "amoxicillin":["amoxicillin","amoxicillintrihydrate","阿莫西林","安莫西林"],
  "tulathromycin":["tulathromycin","泰拉黴素","泰拉黴素"],
  "sulfamonomethoxine":["sulfamonomethoxine","sulfamonomethoxinesodium","磺胺一甲氧嘧啶"],
  "trimethoprim":["trimethoprim","甲氧苄啶","三甲氧苄氨嘧啶"]
};
const astPathogenDiseaseMap = [
  {keys:["actinobacilluspleuropneumoniae","胸膜肺炎放線桿菌","胸膜肺炎放線桿菌"], diseases:["豬傳染性胸膜肺炎"]},
  {keys:["pasteurellamultocida","巴氏桿菌","巴氏桿菌","巴斯德桿菌","巴斯德桿菌"], diseases:["豬肺疫"]},
  {keys:["glaesserellaparasuis","haemophilusparasuis","副嗜血桿菌","副嗜血桿菌"], diseases:["豬副嗜血桿菌病"]},
  {keys:["escherichiacoli","ecoli","大腸桿菌","大腸桿菌"], diseases:["豬大腸桿菌病"]},
  {keys:["salmonella","沙門氏菌","沙門氏菌","沙氏桿菌","沙氏桿菌"], diseases:["豬沙門菌病"]},
  {keys:["streptococcussuis","鏈球菌","鏈球菌"], diseases:["豬鏈球菌病"]},
  {keys:["mycoplasmahyopneumoniae","豬肺炎黴漿菌","豬肺炎支原體","豬肺炎黴漿菌"], diseases:["肺炎"]},
  {keys:["bordetellabronchiseptica","支氣管敗血性博德氏桿菌","支氣管敗血性博德氏桿菌"], diseases:["豬傳染性萎縮性鼻炎"]},
  {keys:["erysipelothrixrhusiopathiae","豬丹毒桿菌","豬丹毒桿菌"], diseases:["豬丹毒"]},
  {keys:["brachyspirahyodysenteriae","豬痢疾短螺旋體","豬痢疾短螺旋體"], diseases:["豬痢疾"]}
];
function astNorm(s){ return normalize(String(s||"")).replace(/[·\-\s_\/()（）]/g,""); }
function astCanonicalIngredient(text){
  const n=astNorm(text);
  for(const [canon,aliases] of Object.entries(astIngredientAliases)){
    if(aliases.some(a=>n.includes(astNorm(a)))) return canon;
  }
  return n||"";
}
function licenseIngredientCanon(p){
  const n=astNorm(p.ingredient||"");
  const out=[];
  for(const [canon,aliases] of Object.entries(astIngredientAliases)){
    if(aliases.some(a=>n.includes(astNorm(a)))) out.push(canon);
  }
  return out.length?out:[n];
}
function inferredDiseasesFromAstResult(r){
  const text=astNorm([r.astOrganism,r.target,r.detail].join(" "));
  const out=[];
  astPathogenDiseaseMap.forEach(m=>{
    if(m.keys.some(k=>text.includes(astNorm(k)))) out.push(...m.diseases);
  });
  return uniq(out);
}
function astResultsForOrder(o){
  return (o.results||[]).filter(r=>r.method==="藥物敏感性" || r.astDrug || r.astInterpretation);
}
function astInterpretationLabel(v){
  const map={S:"S｜敏感",I:"I｜中介／需增加暴露判讀",R:"R｜抗藥",NA:"未提供判讀"};
  return map[v]||"未提供判讀";
}
function astMatchClass(v){ return v==="S"?"s":v==="I"?"i":v==="R"?"r":"na"; }

function buildAstLicenseMatches(o){
  const asts=astResultsForOrder(o);
  const matches=[];
  asts.forEach((r,ri)=>{
    const canon=astCanonicalIngredient(r.astDrug||r.target||"");
    if(!canon)return;
    const inferred=uniq([
      ...(o.suspectDisease?[o.suspectDisease]:[]),
      ...inferredDiseasesFromAstResult(r)
    ]);
    licenseProducts().filter(p=>p.category==="抗菌藥").forEach(p=>{
      const pcs=licenseIngredientCanon(p);
      if(!pcs.includes(canon)) return;
      const diseaseHit=(p.disease_keys||[]).some(d=>inferred.some(x=>normalize(x).includes(normalize(d))||normalize(d).includes(normalize(x))));
      matches.push({
        resultIndex:ri,
        ast:r,
        product:p,
        canon,
        diseaseHit,
        inferred
      });
    });
  });
  const rank={S:0,I:1,NA:2,"":2,R:3};
  return matches.sort((a,b)=>(rank[a.ast.astInterpretation||""]??2)-(rank[b.ast.astInterpretation||""]??2) || Number(b.diseaseHit)-Number(a.diseaseHit));
}
function renderAstLicenseMatches(o){
  if(!$("#astLicenseMatches"))return;
  const asts=astResultsForOrder(o);
  const matches=buildAstLicenseMatches(o);
  const counts={S:0,I:0,R:0,NA:0};
  asts.forEach(r=>counts[r.astInterpretation||"NA"]=(counts[r.astInterpretation||"NA"]||0)+1);
  $("#astLicenseSummary").innerHTML=[
    ["藥敏結果",asts.length],
    ["S 敏感",counts.S||0],
    ["I 中介",counts.I||0],
    ["R 抗藥",counts.R||0],
    ["許可產品交叉命中",matches.length]
  ].map(([k,v])=>`<div class="ast-summary-box"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join("");

  if(!asts.length){
    $("#astLicenseMatches").innerHTML=`<div class="notice">尚未建立結構化藥敏結果。新增檢驗結果時選「藥物敏感性」，並填入抗菌藥成分與實驗室 S／I／R 判讀。</div>`;
    return;
  }
  if(!matches.length){
    $("#astLicenseMatches").innerHTML=`<div class="notice">已有藥敏結果，但目前 V11/V12 已核對的台灣有效許可產品中，尚未找到相同有效成分。這不代表台灣沒有其他合法產品；可開啟官方許可證查詢進一步確認。</div>`;
    return;
  }
  $("#astLicenseMatches").innerHTML=matches.map(m=>{
    const r=m.ast,p=m.product,cls=astMatchClass(r.astInterpretation);
    let headline,reason;
    if(r.astInterpretation==="S"){
      headline="檢驗顯示 S；可列入與獸醫師討論的合法產品候選";
      reason="此產品有效成分與藥敏項目相符。S 不等於一定臨床有效，仍需確認感染部位、判讀標準、劑型、適應症、藥動學與停藥期。";
    }else if(r.astInterpretation==="I"){
      headline="檢驗顯示 I；不應僅依此結果直接選藥";
      reason="I 的定義可能依實驗室標準而異，有些標準代表增加暴露後可能有效。系統不會自行換算劑量或建議加量。";
    }else if(r.astInterpretation==="R"){
      headline="檢驗顯示 R；系統標示為不利線索";
      reason="同一有效成分的台灣許可產品仍會列出供追溯，但不應因為有合法許可就忽略實驗室的 R 判讀。";
    }else{
      headline="有成分對應，但沒有可用的 S／I／R 判讀";
      reason="若報告沒有明確 判讀臨界值 或 S／I／R，不應自行由 MIC／抑菌圈推論敏感性。";
    }
    const diseaseText=m.diseaseHit
      ?"產品核准適應症與目前病例／分離菌推定疾病有對應。"
      :"只確認有效成分相符；目前病例與此產品核准疾病對應尚不明確，需另核對。";
    return `<article class="ast-match ${cls}">
      <div class="ast-match-head">
        <div>
          <div class="eyebrow">藥敏 × 許可證</div>
          <h4>${esc(p.name)}｜${esc(p.ingredient)}</h4>
          <div class="license-expiry">${esc(p.license)} · 有效至 ${esc(p.expiry)}</div>
        </div>
        <span class="ast-pill ${cls}">${esc(astInterpretationLabel(r.astInterpretation))}</span>
      </div>
      <div class="ast-reason"><b>${esc(headline)}</b><br>${esc(reason)}<br>${esc(diseaseText)}</div>
      <div class="license-disease-tags">${(p.disease_keys||[]).map(d=>`<span class="badge">${esc(diseaseLabelByName(d))}</span>`).join("")}</div>
      <div class="actions">
        <button class="secondary" onclick="openLicenseDetail(${licenseProducts().indexOf(p)})">查看台灣許可內容</button>
        <a class="secondary license-official-link" href="${p.url}" target="_blank" rel="noopener">官方許可證</a>
      </div>
    </article>`;
  }).join("");
}
$("#openAllLicensesFromAst").onclick=()=>switchTab("licenses");

/* ---------- V9 Sample & Lab Management ---------- */
function saveLabOrders(){
  localStorage.setItem("pigLabOrders",JSON.stringify(labOrders)); markLocalChanged();
}
function labOrderById(id){
  return labOrders.find(o=>String(o.id)===String(id));
}
function labStatusLabel(s){
  const map={pending:"待送／待檢",processing:"檢驗中",support:"檢驗支持",confirmed:"確診",excluded:"排除",negative:"未支持"};
  return map[s]||"待送／待檢";
}
function labStatusClass(s){
  return ["pending","processing","support","confirmed","excluded","negative"].includes(s)?s:"pending";
}
function refreshLabCaseSelect(){
  const sel=$("#labCaseSelect"); if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">選擇追蹤病例（可不選）</option>';
  trackedCases.forEach(c=>sel.insertAdjacentHTML("beforeend",`<option value="${c.id}">${esc(c.name||"未命名病例")}｜${esc([c.barn,c.pen].filter(Boolean).join("/")||"未填棟舍")}</option>`));
  if([...sel.options].some(o=>o.value===cur)) sel.value=cur;
}
function labKpis(){
  const counts={pending:0,processing:0,support:0,confirmed:0,excluded:0,negative:0};
  labOrders.forEach(o=>counts[o.status||"pending"]=(counts[o.status||"pending"]||0)+1);
  const totalSamples=labOrders.reduce((n,o)=>n+(o.samples||[]).length,0);
  const totalResults=labOrders.reduce((n,o)=>n+(o.results||[]).length,0);
  return {counts,totalSamples,totalResults};
}
function renderLabKpis(){
  const k=labKpis();
  $("#labKpis").innerHTML=[
    ["送檢紀錄",labOrders.length,"件","全部"],
    ["待送／待檢",k.counts.pending,"件","尚未完成"],
    ["檢驗中",k.counts.processing,"件","進行中"],
    ["檢驗支持／確診",k.counts.support+k.counts.confirmed,"件","支持目前判斷"],
    ["排除／未支持",k.counts.excluded+k.counts.negative,"件","需回到鑑別診斷"],
    ["樣本／結果",`${k.totalSamples}/${k.totalResults}`,"","樣本數／結果數"]
  ].map(([a,b,u,sub])=>`<div class="dashboard-kpi"><span>${esc(a)}</span><b>${esc(String(b))}${esc(u||"")}</b><small>${esc(sub)}</small></div>`).join("");
}
function labSearchText(o){
  const c=trackedCaseById(o.caseId);
  return normalize([
    o.name,o.destination,o.suspectDisease,o.clinicalSummary,o.note,
    c?.name,c?.barn,c?.pen,
    ...(o.samples||[]).flatMap(x=>[x.id,x.type,x.animalId,x.note]),
    ...(o.results||[]).flatMap(x=>[x.method,x.target,x.value,x.detail,x.labNo])
  ].join(" "));
}
function renderLabOrders(){
  if(!$("#labOrderList"))return;
  refreshLabCaseSelect();
  renderLabKpis();
  const q=normalize($("#labSearch").value||"");
  const status=$("#labStatusFilter").value||"";
  let arr=labOrders.slice().sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  arr=arr.filter(o=>(!status||o.status===status)&&(!q||labSearchText(o).includes(q)));
  $("#labOrderList").innerHTML=arr.length?arr.map(o=>{
    const c=trackedCaseById(o.caseId);
    return `<button class="lab-order-item ${String(activeLabOrderId)===String(o.id)?"active":""}" onclick="selectLabOrder('${o.id}')">
      <div><span class="lab-status ${labStatusClass(o.status)}">${esc(labStatusLabel(o.status))}</span></div>
      <h4>${esc(o.name||"未命名送檢")}</h4>
      <p>${esc(o.sampleDate||"")} · ${esc(o.destination||"未填實驗室")}</p>
      <p>${esc(o.suspectDisease||"未填懷疑疾病")}${c?` · ${esc(c.name||"")}`:""}</p>
      <p>${(o.samples||[]).length} 樣本 · ${(o.results||[]).length} 結果</p>
    </button>`;
  }).join(""):`<p class="muted">目前沒有符合條件的送檢紀錄。</p>`;

  if(activeLabOrderId && labOrderById(activeLabOrderId)) renderLabOrderDetail();
  else {
    $("#labDetail").classList.add("hidden");
    $("#labEmpty").classList.remove("hidden");
  }
}
window.selectLabOrder=(id)=>{
  activeLabOrderId=id;
  renderLabOrders();
  renderLabOrderDetail();
};
function labValueLabel(v){
  const map={positive:"陽性",negative:"陰性",suspect:"疑似／臨界",mixed:"混合／多重",other:"其他"};
  return map[v]||v||"未填";
}
function renderLabOrderDetail(){
  const o=labOrderById(activeLabOrderId); if(!o)return;
  const c=trackedCaseById(o.caseId);
  $("#labEmpty").classList.add("hidden");
  $("#labDetail").classList.remove("hidden");
  $("#labOrderMeta").textContent=`${labStatusLabel(o.status)} · 採樣 ${o.sampleDate||"未填日期"}`;
  $("#labOrderTitle").textContent=o.name||"未命名送檢";
  $("#labOrderBadges").innerHTML=[
    o.destination,o.suspectDisease,c?.name,c?.barn
  ].filter(Boolean).map(x=>`<span class="badge">${esc(x)}</span>`).join("");
  $("#labOrderStatus").value=o.status||"pending";

  const info=[
    ["關聯病例",c?c.name:"未連結病例"],
    ["棟舍／欄位",c?[c.barn,c.pen].filter(Boolean).join("／"):"—"],
    ["採樣日期",o.sampleDate||"—"],
    ["採樣人",o.collector||"—"],
    ["送檢單位",o.destination||"—"],
    ["懷疑疾病",o.suspectDisease||"—"],
    ["臨床摘要",o.clinicalSummary||"—"],
    ["備註",o.note||"—"]
  ];
  $("#labOrderInfo").innerHTML=info.map(([k,v])=>`<div><b>${esc(k)}：</b>${esc(v)}</div>`).join("");

  $("#labSampleList").innerHTML=(o.samples||[]).length?(o.samples||[]).map((x,i)=>`
    <div class="lab-sample">
      <h4>${esc(x.id||`樣本 ${i+1}`)} · ${esc(x.type||"未填類型")}</h4>
      <div class="lab-item-meta">${esc([x.animalId,x.storage].filter(Boolean).join(" · ")||"")}</div>
      ${x.note?`<div>${esc(x.note)}</div>`:""}
      <div class="lab-item-actions"><button class="secondary" onclick="deleteLabSample('${o.id}',${i})">刪除</button></div>
    </div>`).join(""):`<p class="muted">尚未建立樣本。</p>`;

  $("#labResultList").innerHTML=(o.results||[]).length?(o.results||[]).map((r,i)=>`
    <div class="lab-result">
      <h4>${esc(r.method||"檢驗")} · ${esc(r.target||"未填目標")} · ${esc(labValueLabel(r.value))}</h4>
      <div class="lab-item-meta">${esc([r.date,r.labNo,r.ct?`Ct ${r.ct}`:""].filter(Boolean).join(" · "))}</div>
      ${r.astDrug?`<div class="license-disease-tags"><span class="ast-pill ${astMatchClass(r.astInterpretation)}">${esc(astInterpretationLabel(r.astInterpretation))}</span><span class="badge">${esc(r.astDrug)}</span>${r.astMic?`<span class="badge">${esc(r.astMic)}</span>`:""}${r.astOrganism?`<span class="badge">${esc(r.astOrganism)}</span>`:""}</div>`:""}
      ${r.detail?`<div>${esc(r.detail)}</div>`:""}
      <div class="lab-item-actions"><button class="secondary" onclick="deleteLabResult('${o.id}',${i})">刪除</button></div>
    </div>`).join(""):`<p class="muted">尚未輸入檢驗結果。</p>`;

  renderLabInterpretation(o,c);
  renderAstLicenseMatches(o);
}
function renderLabInterpretation(o,c){
  const positives=(o.results||[]).filter(r=>r.value==="positive"||r.value==="mixed");
  const negatives=(o.results||[]).filter(r=>r.value==="negative");
  const suspect=(o.results||[]).filter(r=>r.value==="suspect");
  const boxes=[];
  if(positives.length) boxes.push({cls:"support",title:"檢驗支持線索",text:`目前有 ${positives.length} 筆陽性／混合結果：${positives.map(r=>[r.target,r.method].filter(Boolean).join(" ")).join("、")}。結果是否足以「確診」仍應結合樣本來源、檢驗方法、臨床與病理。`});
  if(negatives.length) boxes.push({cls:"exclude",title:"陰性／未支持線索",text:`目前有 ${negatives.length} 筆陰性結果：${negatives.map(r=>[r.target,r.method].filter(Boolean).join(" ")).join("、")}。陰性不一定等於完全排除，需考慮採樣時機、樣本品質與檢驗方法。`});
  if(suspect.length) boxes.push({cls:"neutral",title:"臨界／疑似結果",text:`有 ${suspect.length} 筆疑似或臨界結果，建議依實驗室報告與獸醫師判讀決定是否重採、複驗或改用其他檢驗。`});
  if(!boxes.length) boxes.push({cls:"neutral",title:"尚無可判讀結果",text:"目前還沒有陽性、陰性或臨界結果。先完成樣本與檢驗結果紀錄。"});
  if(c) boxes.push({cls:"neutral",title:"與病例串接",text:`此送檢連結病例「${c.name}」。可回病例追蹤頁對照 Day 0–Day N 的死亡、病豬、採食與處置變化。`});
  $("#labInterpretation").innerHTML=boxes.map(b=>`<div class="interpret-box ${b.cls}"><b>${esc(b.title)}</b><br>${esc(b.text)}</div>`).join("");
}
function prepareLabOrder(caseId=null){
  refreshLabCaseSelect();
  $("#labCaseSelect").value=caseId?String(caseId):"";
  const c=caseId?trackedCaseById(caseId):null;
  $("#labOrderName").value=c?`${c.name} 送檢`:"";
  $("#labSampleDate").value=todayLocal();
  $("#labDestination").value="";
  $("#labSuspectDisease").value=c?caseDiseaseName(c):"";
  $("#labCollector").value="";
  $("#labClinicalSummary").value=c?[c.symptoms,`病例群 ${c.headcount||"—"} 頭`,caseLatest(c)?`最新病豬 ${caseLatest(c).sick??"—"}、死亡 ${caseLatest(c).deaths??"—"}`:""].filter(Boolean).join("；"):"";
  $("#labOrderNote").value="";
  $("#newLabOrderDialog").showModal();
}
$("#newLabOrder").onclick=()=>prepareLabOrder(null);
$("#closeLabOrderDialog").onclick=()=>$("#newLabOrderDialog").close();

$("#saveNewLabOrder").onclick=()=>{
  const id=Date.now();
  const caseId=$("#labCaseSelect").value||null;
  const o={
    id,
    caseId,
    name:$("#labOrderName").value.trim()||`送檢 ${todayLocal()}`,
    sampleDate:$("#labSampleDate").value||todayLocal(),
    destination:$("#labDestination").value.trim(),
    suspectDisease:$("#labSuspectDisease").value.trim(),
    collector:$("#labCollector").value.trim(),
    clinicalSummary:$("#labClinicalSummary").value.trim(),
    note:$("#labOrderNote").value.trim(),
    status:"pending",
    samples:[],
    results:[],
    createdAt:Date.now(),
    updatedAt:Date.now()
  };
  labOrders.unshift(o);saveLabOrders();activeLabOrderId=id;
  $("#newLabOrderDialog").close();
  switchTab("lab");renderLabOrders();renderLabOrderDetail();
};
window.createLabOrderFromCase=(caseId)=>{
  switchTab("lab");
  prepareLabOrder(caseId);
};

$("#addLabSample").onclick=()=>{
  $("#sampleId").value="";
  $("#sampleType").value="";
  $("#sampleAnimalId").value="";
  $("#sampleStorage").value="";
  $("#sampleNote").value="";
  $("#labSampleDialog").showModal();
};
$("#closeLabSampleDialog").onclick=()=>$("#labSampleDialog").close();
$("#saveLabSample").onclick=()=>{
  const o=labOrderById(activeLabOrderId);if(!o)return;
  o.samples=o.samples||[];
  o.samples.push({
    id:$("#sampleId").value.trim()||`S${o.samples.length+1}`,
    type:$("#sampleType").value,
    animalId:$("#sampleAnimalId").value.trim(),
    storage:$("#sampleStorage").value.trim(),
    note:$("#sampleNote").value.trim()
  });
  o.updatedAt=Date.now();saveLabOrders();$("#labSampleDialog").close();renderLabOrders();renderLabOrderDetail();
};
window.deleteLabSample=(orderId,index)=>{
  const o=labOrderById(orderId);if(!o||!o.samples?.[index])return;
  o.samples.splice(index,1);o.updatedAt=Date.now();saveLabOrders();renderLabOrders();renderLabOrderDetail();
};


function updateAstFieldVisibility(){
  const isAst=$("#resultMethod").value==="藥物敏感性";
  $("#astFields").classList.toggle("hidden",!isAst);
}
$("#resultMethod").addEventListener("change",updateAstFieldVisibility);

$("#addLabResult").onclick=()=>{
  $("#resultMethod").value="";
  $("#resultTarget").value="";
  $("#resultValue").value="";
  $("#resultDate").value=todayLocal();
  $("#resultCt").value="";
  $("#resultLabNo").value="";
  $("#astOrganism").value="";
  $("#astDrug").value="";
  $("#astInterpretation").value="";
  $("#astMic").value="";
  $("#astStandard").value="";
  $("#astSampleRef").value="";
  $("#astFields").classList.add("hidden");
  $("#resultDetail").value="";
  $("#labResultDialog").showModal();
};
$("#closeLabResultDialog").onclick=()=>$("#labResultDialog").close();
$("#saveLabResult").onclick=()=>{
  const o=labOrderById(activeLabOrderId);if(!o)return;
  o.results=o.results||[];
  o.results.push({
    method:$("#resultMethod").value,
    target:$("#resultTarget").value.trim(),
    value:$("#resultValue").value,
    date:$("#resultDate").value||todayLocal(),
    ct:$("#resultCt").value.trim(),
    labNo:$("#resultLabNo").value.trim(),
    astOrganism:$("#resultMethod").value==="藥物敏感性"?$("#astOrganism").value.trim():"",
    astDrug:$("#resultMethod").value==="藥物敏感性"?$("#astDrug").value.trim():"",
    astInterpretation:$("#resultMethod").value==="藥物敏感性"?$("#astInterpretation").value:"",
    astMic:$("#resultMethod").value==="藥物敏感性"?$("#astMic").value.trim():"",
    astStandard:$("#resultMethod").value==="藥物敏感性"?$("#astStandard").value.trim():"",
    astSampleRef:$("#resultMethod").value==="藥物敏感性"?$("#astSampleRef").value.trim():"",
    detail:$("#resultDetail").value.trim()
  });
  if(o.status==="pending") o.status="processing";
  o.updatedAt=Date.now();saveLabOrders();$("#labResultDialog").close();renderLabOrders();renderLabOrderDetail();
};
window.deleteLabResult=(orderId,index)=>{
  const o=labOrderById(orderId);if(!o||!o.results?.[index])return;
  o.results.splice(index,1);o.updatedAt=Date.now();saveLabOrders();renderLabOrders();renderLabOrderDetail();
};

$("#labOrderStatus").onchange=e=>{
  const o=labOrderById(activeLabOrderId);if(!o)return;
  o.status=e.target.value;o.updatedAt=Date.now();saveLabOrders();renderLabOrders();renderLabOrderDetail();
};
$("#deleteLabOrder").onclick=()=>{
  const o=labOrderById(activeLabOrderId);if(!o)return;
  if(!confirm(`確定刪除送檢紀錄「${o.name}」？`))return;
  labOrders=labOrders.filter(x=>String(x.id)!==String(o.id));saveLabOrders();activeLabOrderId=null;renderLabOrders();
};
$("#printLabOrder").onclick=()=>window.print();
$("#labSearch").addEventListener("input",renderLabOrders);
$("#labStatusFilter").addEventListener("change",renderLabOrders);
$("#exportLabJson").onclick=()=>downloadBlob(`豬病檢驗紀錄_${todayLocal()}.json`,JSON.stringify(labOrders,null,2),"application/json;charset=utf-8");

renderLabOrders();


/* ---------- V16 Dashboard Risk Radar & Daily Priorities ---------- */
function dailyTaskDayKey(){ return todayLocal(); }
function saveDailyTaskChecks(){
  localStorage.setItem("pigDailyTaskChecks",JSON.stringify(dailyTaskChecks)); markLocalChanged();
}
function taskCheckKey(task){ return `${dailyTaskDayKey()}|${task.id}`; }

function riskInputs(){
  const active=trackedCases.filter(c=>c.status!=="closed");
  const worsening=active.filter(c=>caseTrend(c).kind==="worsening").length;
  const today= todayLocal();
  const todayDeaths=allEntriesOnDate(today).reduce((n,x)=>n+(Number(x.entry.deaths)||0),0);
  const pendingLabs=labOrders.filter(o=>["pending","processing"].includes(o.status||"pending")).length;
  const noResponse=treatmentPlans.filter(t=>["no_response","worsening"].includes(t.outcome||"active")).length;

  let amrHigh=0;
  try{
    const stats=amrIngredientStats(amrTreatmentRows(),amrAstRows());
    amrHigh=stats.filter(x=>x.sir>=3&&x.rPct!==null&&x.rPct>=50).length;
  }catch(e){ amrHigh=0; }

  const cross=dashboardCrossSignals(active).filter(x=>x.barns>=2&&x.count>=2).length;
  return {worsening,todayDeaths,pendingLabs,noResponse,amrHigh,cross,activeCount:active.length};
}
function riskScores(){
  const x=riskInputs();
  const clamp=n=>Math.max(0,Math.min(100,n));
  return {
    "病例惡化":clamp(x.worsening*30),
    "今日死亡":clamp(x.todayDeaths*12),
    "待送檢／待結果":clamp(x.pendingLabs*18),
    "治療無反應":clamp(x.noResponse*25),
    "AMR／R警示":clamp(x.amrHigh*40),
    "跨棟共同訊號":clamp(x.cross*25)
  };
}
function overallRiskLevel(scores){
  const vals=Object.values(scores);
  const max=Math.max(0,...vals);
  const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
  const score=Math.max(max*0.7+avg*0.3,avg);
  if(score>=70)return {level:"critical",label:"極高",score:Math.round(score)};
  if(score>=45)return {level:"high",label:"高",score:Math.round(score)};
  if(score>=22)return {level:"medium",label:"中",score:Math.round(score)};
  return {level:"low",label:"低",score:Math.round(score)};
}
function drawRiskRadar(){
  const canvas=$("#riskRadarCanvas"); if(!canvas)return;
  const scores=riskScores(),labels=Object.keys(scores),vals=Object.values(scores);
  const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
  const w=Math.max(300,rect.width||420),h=Math.round(w*0.72);
  canvas.width=w*ratio;canvas.height=h*ratio;canvas.style.height=h+"px";
  const ctx=canvas.getContext("2d");ctx.scale(ratio,ratio);ctx.clearRect(0,0,w,h);
  const cx=w/2,cy=h/2+5,r=Math.min(w,h)*0.33,n=labels.length;
  const point=(i,val=100)=>{
    const a=-Math.PI/2+i*2*Math.PI/n,rr=r*val/100;
    return [cx+Math.cos(a)*rr,cy+Math.sin(a)*rr];
  };
  ctx.font="11px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
  [25,50,75,100].forEach(level=>{
    ctx.strokeStyle="#e2e8f0";ctx.lineWidth=1;ctx.beginPath();
    labels.forEach((_,i)=>{const [x,y]=point(i,level);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.stroke();
  });
  labels.forEach((lab,i)=>{
    const [x,y]=point(i,100),[lx,ly]=point(i,118);
    ctx.strokeStyle="#e2e8f0";ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(x,y);ctx.stroke();
    ctx.fillStyle="#475569";ctx.fillText(lab,lx,ly);
  });
  ctx.fillStyle="rgba(15,118,110,.16)";ctx.strokeStyle="#0f766e";ctx.lineWidth=2;ctx.beginPath();
  vals.forEach((v,i)=>{const [x,y]=point(i,v);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.fill();ctx.stroke();
  vals.forEach((v,i)=>{const [x,y]=point(i,v);ctx.fillStyle="#0f766e";ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();});
  $("#riskRadarLegend").innerHTML=labels.map((lab,i)=>`<div class="risk-legend-row"><span>${esc(lab)}</span><b>${vals[i]}</b></div>`).join("");
  const overall=overallRiskLevel(scores);
  $("#riskRadarLevel").className=`risk-level ${overall.level}`;
  $("#riskRadarLevel").textContent=`${overall.label}風險 · ${overall.score}`;
}

function buildDailyTasks(){
  const tasks=[],today=todayLocal();
  const add=(task)=>tasks.push(task);

  trackedCases.filter(c=>c.status!=="closed").forEach(c=>{
    const trend=caseTrend(c),latest=caseLatest(c);
    if(trend.kind==="worsening"){
      add({id:`case-worse-${c.id}`,priority:"critical",type:"病例",title:`優先檢查惡化病例：${c.name||"未命名"}`,desc:`${[c.barn,c.pen,caseDiseaseLabel(c)].filter(Boolean).join(" · ")}｜${trend.text}`,action:"tracker",ref:c.id});
    }else if(trend.kind==="stable" && latest){
      add({id:`case-stable-${c.id}`,priority:"normal",type:"病例",title:`持續追蹤：${c.name||"未命名"}`,desc:`目前大致持平；最新病豬 ${latest.sick??"—"}、死亡 ${latest.deaths??"—"}。`,action:"tracker",ref:c.id});
    }
  });

  labOrders.forEach(o=>{
    if((o.status||"pending")==="pending"){
      add({id:`lab-pending-${o.id}`,priority:"high",type:"檢驗",title:`待送／待檢：${o.name||"未命名送檢"}`,desc:`採樣 ${o.sampleDate||"未填"}｜${o.destination||"未填實驗室"}｜${o.suspectDisease||"未填疾病"}`,action:"lab",ref:o.id});
    }else if(o.status==="processing"){
      add({id:`lab-processing-${o.id}`,priority:"normal",type:"檢驗",title:`追蹤檢驗結果：${o.name||"未命名送檢"}`,desc:`目前狀態：檢驗中。`,action:"lab",ref:o.id});
    }
  });

  treatmentPlans.forEach(t=>{
    const c=trackedCaseById(t.caseId);
    if(t.outcome==="worsening"){
      add({id:`tx-worse-${t.id}`,priority:"critical",type:"治療",title:`治療方案呈惡化：${t.name||"未命名方案"}`,desc:`${c?.name||"未連結病例"}｜${t.ingredient||t.product||"未填成分"}。請回查診斷、藥敏與管理因素。`,action:"treatment",ref:t.id});
    }else if(t.outcome==="no_response"){
      add({id:`tx-noresp-${t.id}`,priority:"high",type:"治療",title:`治療無明顯反應：${t.name||"未命名方案"}`,desc:`${c?.name||"未連結病例"}｜${t.ingredient||t.product||"未填成分"}。`,action:"treatment",ref:t.id});
    }else if(t.outcome==="active"){
      const d=dateDiffDays(t.startDate,today);
      if(d!==null&&d>=2){
        add({id:`tx-review-${t.id}`,priority:"normal",type:"治療",title:`評估進行中方案：${t.name||"未命名方案"}`,desc:`已進行 ${d+1} 天，建議補今天的病豬、死亡、採食與反應紀錄。`,action:"treatment",ref:t.id});
      }
    }
  });

  try{
    const stats=amrIngredientStats(amrTreatmentRows(),amrAstRows());
    stats.filter(x=>x.sir>=3&&x.rPct!==null&&x.rPct>=50).forEach(x=>{
      add({id:`amr-${x.canon}`,priority:"high",type:"AMR",title:`R 集中訊號：${x.ingredient}`,desc:`目前已輸入 S/I/R 中，R ${x.R}/${x.sir}（${x.rPct.toFixed(0)}%）。優先回查菌種、樣本來源與近期使用。`,action:"amr",ref:x.canon});
    });
  }catch(e){}

  const cross=dashboardCrossSignals(trackedCases.filter(c=>c.status!=="closed")).filter(x=>x.barns>=2&&x.count>=2);
  cross.slice(0,3).forEach(x=>{
    add({id:`cross-${normalize(x.label)}`,priority:"high",type:"群聚",title:`跨棟共同訊號：${x.label}`,desc:`${x.count} 件病例、${x.barns} 個棟舍／單位。需核對是否同一批次、共同來源或只是相似症候群。`,action:"dashboard",ref:""});
  });

  if(!tasks.length){
    add({id:"routine-check",priority:"normal",type:"例行",title:"完成今日例行疾病巡查",desc:"確認各棟精神、採食、飲水、死亡、腹瀉、呼吸與繁殖異常，必要時建立新病例。",action:"dashboard",ref:""});
  }
  const order={critical:0,high:1,normal:2};
  return tasks.sort((a,b)=>order[a.priority]-order[b.priority]||a.title.localeCompare(b.title));
}
function renderDailyTasks(){
  if(!$("#dailyTaskList"))return;
  const filter=$("#taskPriorityFilter")?.value||"";
  let tasks=buildDailyTasks();
  if(filter)tasks=tasks.filter(t=>t.priority===filter);
  const completed=tasks.filter(t=>!!dailyTaskChecks[taskCheckKey(t)]).length;
  const all=buildDailyTasks();
  const allDone=all.filter(t=>!!dailyTaskChecks[taskCheckKey(t)]).length;
  $("#dailyTaskSummary").innerHTML=`
    <span class="badge">今日 ${all.length} 件</span>
    <span class="badge">完成 ${allDone}</span>
    <span class="badge">立即 ${all.filter(t=>t.priority==="critical").length}</span>
    <span class="badge">高 ${all.filter(t=>t.priority==="high").length}</span>`;
  $("#dailyTaskList").innerHTML=tasks.map(t=>{
    const done=!!dailyTaskChecks[taskCheckKey(t)];
    return `<div class="daily-task ${t.priority} ${done?"done":""}">
      <input type="checkbox" ${done?"checked":""} onchange="toggleDailyTask('${esc(t.id)}',this.checked)">
      <div>
        <div class="daily-task-title">${esc(t.title)}</div>
        <div class="daily-task-desc">${esc(t.desc)}</div>
      </div>
      <div>
        <span class="task-priority ${t.priority}">${t.priority==="critical"?"立即":t.priority==="high"?"高":"一般"}</span>
        <button class="secondary task-link" onclick="openDailyTask('${esc(t.action)}','${esc(String(t.ref||""))}')">開啟</button>
      </div>
    </div>`;
  }).join("");
}
window.toggleDailyTask=(id,checked)=>{
  const key=`${dailyTaskDayKey()}|${id}`;
  dailyTaskChecks[key]=checked;saveDailyTaskChecks();renderDailyTasks();
};
window.openDailyTask=(action,ref)=>{
  if(action==="tracker"){activeTrackedCaseId=ref;switchTab("tracker");renderTrackedCases();renderTrackedCaseDetail();}
  else if(action==="lab"){activeLabOrderId=ref;switchTab("lab");renderLabOrders();renderLabOrderDetail();}
  else if(action==="treatment"){activeTreatmentPlanId=ref;switchTab("treatment");renderTreatmentPlans();renderTreatmentDetail();}
  else if(action==="amr"){switchTab("amr");$("#amrIngredientFilter").value=ref;renderAmrMonitor();}
  else switchTab("dashboard");
};
$("#taskPriorityFilter")?.addEventListener("change",renderDailyTasks);
$("#resetDailyTasks").onclick=()=>{
  const prefix=dailyTaskDayKey()+"|";
  Object.keys(dailyTaskChecks).filter(k=>k.startsWith(prefix)).forEach(k=>delete dailyTaskChecks[k]);
  saveDailyTaskChecks();renderDailyTasks();
};

function renderRiskCommandCenter(){
  drawRiskRadar();
  renderDailyTasks();
}

/* ---------- V8 Farm Disease Command Center ---------- */
function activeTrackedCases(){
  return trackedCases.filter(c=>c.status!=="closed");
}
function latestEntryOnDate(c,date){
  const arr=(c.entries||[]).filter(e=>e.date===date);
  return arr.length?arr[arr.length-1]:null;
}
function allEntriesOnDate(date){
  return trackedCases.flatMap(c=>(c.entries||[]).filter(e=>e.date===date).map(e=>({caseObj:c,entry:e})));
}
function dashboardTodayDate(){
  return todayLocal();
}
function caseSymptomsText(c){
  return normalize([c.symptoms,caseDiseaseName(c)].join(" "));
}
function caseSyndromeBuckets(c){
  const text=caseSymptomsText(c);
  const out=[];
  const defs={
    "呼吸道":["咳嗽","呼吸","喘","肺","鼻"],
    "腸道":["腹瀉","腹瀉","下痢","腸","腸","嘔吐","嘔吐"],
    "神經":["神經","神經","抽搐","震顫","震顫","轉圈","轉圈"],
    "繁殖":["流產","流產","死胎","木乃伊","返情","繁殖"],
    "皮膚":["皮膚","皮膚","水皰","結痂","結痂","發紺","發紺"],
    "跛行／關節":["跛行","關節","關節","蹄"],
    "高死亡／猝死":["猝死","死亡","急死"]
  };
  for(const [k,words] of Object.entries(defs)){
    if(words.some(w=>text.includes(normalize(w)))) out.push(k);
  }
  return out;
}
function dashboardStats(){
  const active=activeTrackedCases();
  const today=dashboardTodayDate();
  const todayEntries=allEntriesOnDate(today);
  const todayDeaths=todayEntries.reduce((n,x)=>n+(Number(x.entry.deaths)||0),0);
  const todaySick=todayEntries.reduce((n,x)=>n+(Number(x.entry.sick)||0),0);
  const worsening=active.filter(c=>caseTrend(c).kind==="worsening").length;
  const improving=active.filter(c=>caseTrend(c).kind==="improving").length;
  const open=active.filter(c=>c.status==="open").length;
  const watch=active.filter(c=>c.status==="watch").length;
  const cumulative=active.reduce((n,c)=>n+cumulativeDeaths(c),0);
  return {active,today,todayEntries,todayDeaths,todaySick,worsening,improving,open,watch,cumulative};
}
function renderDashboard(){
  if(!$("#dashboardKpis")) return;
  const st=dashboardStats();

  $("#dashboardKpis").innerHTML=[
    ["追蹤中病例",st.active.length,"件",`${st.open} 追蹤中 · ${st.watch} 觀察`],
    ["今日新增死亡",st.todayDeaths,"頭",st.today],
    ["今日記錄病豬",st.todaySick,"頭","依今天有填紀錄的病例"],
    ["惡化病例",st.worsening,"件",st.worsening?"需要優先檢視":"目前無"],
    ["改善病例",st.improving,"件","依最近兩筆量化紀錄"],
    ["追蹤病例累計死亡",st.cumulative,"頭","未包含已結案病例"]
  ].map(([k,v,u,sub])=>`<div class="dashboard-kpi"><span>${esc(k)}</span><b>${esc(String(v))}${esc(u)}</b><small>${esc(sub)}</small></div>`).join("");

  renderDashboardAlerts(st);
  renderDashboardCaseTable(st.active);
  renderDashboardToday(st);
  renderDashboardCrossBarn(st.active);
  renderDashboardDiseaseDistribution(st.active);
  renderFarmTrendChart();
  renderRiskCommandCenter();
}
function renderDashboardAlerts(st){
  const alerts=[];
  if(st.worsening>0) alerts.push({kind:"danger",text:`目前有 ${st.worsening} 件病例呈惡化趨勢，建議優先檢查最新死亡、病豬頭數、採食與處置紀錄。`});
  if(st.todayDeaths>=5) alerts.push({kind:"danger",text:`今天追蹤病例合計新增死亡 ${st.todayDeaths} 頭，已達需要特別注意的事件量。`});
  const barns=new Map();
  st.active.forEach(c=>{
    const key=(c.barn||"").trim();
    if(!key)return;
    barns.set(key,(barns.get(key)||0)+1);
  });
  const multiBarn=[...barns.entries()].filter(([,n])=>n>=2);
  if(multiBarn.length) alerts.push({kind:"warn",text:`同一棟／單位同時有多個追蹤病例：${multiBarn.map(([b,n])=>`${b} ${n} 件`).join("、")}。`});
  const cross=dashboardCrossSignals(st.active).filter(x=>x.barns>=2 && x.count>=2);
  if(cross.length) alerts.push({kind:"warn",text:`偵測到跨棟共同訊號：${cross.slice(0,3).map(x=>`${x.label}（${x.barns} 棟）`).join("、")}。請把它視為需進一步核對的群聚訊號，不代表已證實跨棟傳播。`});
  if(!alerts.length) alerts.push({kind:"ok",text:"目前沒有偵測到明顯的全場惡化或跨棟共同訊號。仍應持續依病例紀錄更新。"});
  $("#dashboardAlerts").innerHTML=alerts.map(a=>`<div class="dashboard-alert ${a.kind}">${esc(a.text)}</div>`).join("");
}
function renderDashboardCaseTable(active){
  const filter=$("#dashboardCaseFilter")?.value||"";
  let arr=active.slice().sort((a,b)=>{
    const order={worsening:0,stable:1,improving:2};
    return (order[caseTrend(a).kind]??3)-(order[caseTrend(b).kind]??3) || (b.updatedAt||0)-(a.updatedAt||0);
  });
  if(filter) arr=arr.filter(c=>caseTrend(c).kind===filter);
  $("#dashboardCaseTable").innerHTML=arr.length?`<table class="dashboard-table"><thead><tr>
    <th>病例</th><th>棟舍／欄位</th><th>懷疑疾病</th><th>最新病豬</th><th>最新死亡</th><th>採食</th><th>趨勢</th><th></th>
  </tr></thead><tbody>${arr.map(c=>{
    const e=caseLatest(c),t=caseTrend(c);
    return `<tr>
      <td><span class="dashboard-case-name">${esc(c.name||"未命名")}</span><br><span class="case-card-time">${esc(c.ageGroup||"")}</span></td>
      <td>${esc([c.barn,c.pen].filter(Boolean).join("／")||"—")}</td>
      <td>${esc(caseDiseaseLabel(c))}</td>
      <td>${esc(String(e?.sick??"—"))}</td>
      <td>${esc(String(e?.deaths??"—"))}</td>
      <td>${esc(e?.feed!==null&&e?.feed!==undefined&&e?.feed!==""?`${e.feed}%`:"—")}</td>
      <td><span class="trend-pill ${t.kind}">${esc(t.label)}</span></td>
      <td><button class="secondary" onclick="openDashboardCase('${c.id}')">開啟</button></td>
    </tr>`;
  }).join("")}</tbody></table>`:`<p class="muted">目前沒有符合條件的追蹤病例。</p>`;
}
window.openDashboardCase=(id)=>{
  activeTrackedCaseId=id;
  switchTab("tracker");
  renderTrackedCases();
  renderTrackedCaseDetail();
};
function renderDashboardToday(st){
  const entries=st.todayEntries;
  if(!entries.length){
    $("#dashboardToday").innerHTML=`<p class="muted">今天尚未新增病例追蹤紀錄。</p>`;
    return;
  }
  const withSick=entries.filter(x=>x.entry.sick!==null&&x.entry.sick!=="");
  const avgTempVals=entries.map(x=>Number(x.entry.temp)).filter(Number.isFinite);
  const avgFeedVals=entries.map(x=>Number(x.entry.feed)).filter(Number.isFinite);
  const avgWaterVals=entries.map(x=>Number(x.entry.water)).filter(Number.isFinite);
  const rows=[
    ["有更新的病例",entries.length+" 件"],
    ["新增死亡",st.todayDeaths+" 頭"],
    ["病豬頭數合計",withSick.reduce((n,x)=>n+(Number(x.entry.sick)||0),0)+" 頭"],
    ["平均體溫",avgTempVals.length?(avgTempVals.reduce((a,b)=>a+b,0)/avgTempVals.length).toFixed(1)+" ℃":"—"],
    ["平均採食",avgFeedVals.length?(avgFeedVals.reduce((a,b)=>a+b,0)/avgFeedVals.length).toFixed(0)+"%":"—"],
    ["平均飲水",avgWaterVals.length?(avgWaterVals.reduce((a,b)=>a+b,0)/avgWaterVals.length).toFixed(0)+"%":"—"]
  ];
  $("#dashboardToday").innerHTML=rows.map(([k,v])=>`<div class="dash-row"><span>${esc(k)}</span><span class="dash-value">${esc(v)}</span></div>`).join("");
}
function dashboardCrossSignals(active){
  const map=new Map();
  active.forEach(c=>{
    const barn=(c.barn||"未填棟舍").trim()||"未填棟舍";
    const labels=[caseDiseaseName(c),...caseSyndromeBuckets(c)].filter(Boolean);
    labels.forEach(label=>{
      const key=label;
      if(!map.has(key)) map.set(key,{label,count:0,barnsSet:new Set(),cases:[]});
      const x=map.get(key);x.count++;x.barnsSet.add(barn);x.cases.push(c.name||"未命名");
    });
  });
  return [...map.values()].map(x=>({...x,barns:x.barnsSet.size})).sort((a,b)=>b.barns-a.barns||b.count-a.count);
}
function renderDashboardCrossBarn(active){
  const signals=dashboardCrossSignals(active).filter(x=>x.count>=2).slice(0,8);
  $("#dashboardCrossBarn").innerHTML=signals.length?signals.map(x=>`
    <div class="cross-signal">
      <b>${esc(x.label)}</b>
      <div>${x.count} 件病例 · ${x.barns} 個棟舍／單位</div>
      <small class="muted">${esc(x.cases.slice(0,4).join("、"))}${x.cases.length>4?"…":""}</small>
    </div>`).join(""):`<p class="muted">目前沒有重複出現在多個病例中的明顯共同訊號。</p>`;
}
function renderDashboardDiseaseDistribution(active){
  const counts=new Map();
  active.forEach(c=>{
    const disease=caseDiseaseLabel(c);
    counts.set(disease,(counts.get(disease)||0)+1);
    caseSyndromeBuckets(c).forEach(s=>counts.set(s,(counts.get(s)||0)+1));
  });
  const arr=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
  const max=Math.max(1,...arr.map(x=>x[1]));
  $("#dashboardDiseaseDist").innerHTML=arr.length?arr.map(([name,n])=>`
    <div class="dist-item"><b>${esc(name)}</b><div>${n} 件病例</div><div class="dist-bar"><span style="width:${Math.round(n/max*100)}%"></span></div></div>`).join(""):`<p class="muted">尚無追蹤病例資料。</p>`;
}
function dateRangeLabels(days){
  const out=[],today=new Date(todayLocal()+"T00:00:00");
  for(let i=days-1;i>=0;i--){
    const d=new Date(today);d.setDate(today.getDate()-i);
    const z=n=>String(n).padStart(2,"0");
    out.push(`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`);
  }
  return out;
}
function renderFarmTrendChart(){
  const days=Number($("#dashboardRange")?.value||7);
  const labels=dateRangeLabels(days);
  const sick=[],deaths=[];
  labels.forEach(date=>{
    const entries=allEntriesOnDate(date);
    sick.push(entries.reduce((n,x)=>n+(Number(x.entry.sick)||0),0));
    deaths.push(entries.reduce((n,x)=>n+(Number(x.entry.deaths)||0),0));
  });
  const canvas=$("#farmTrendChart");if(!canvas)return;
  const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1,w=Math.max(420,rect.width||900),h=240;
  canvas.width=w*ratio;canvas.height=h*ratio;canvas.style.height=h+"px";
  const ctx=canvas.getContext("2d");ctx.scale(ratio,ratio);ctx.clearRect(0,0,w,h);
  const pad={l:48,r:20,t:24,b:40},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,max=Math.max(1,...sick,...deaths);
  ctx.strokeStyle="#cbd5e1";ctx.beginPath();ctx.moveTo(pad.l,pad.t);ctx.lineTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
  for(let k=0;k<=4;k++){
    const val=max*(4-k)/4,yy=pad.t+ph*k/4;
    ctx.fillStyle="#64748b";ctx.font="11px sans-serif";ctx.textAlign="right";ctx.fillText(val.toFixed(0),pad.l-6,yy+4);
    ctx.strokeStyle="#eef2f7";ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();
  }
  const x=i=>pad.l+(labels.length<=1?pw/2:i*pw/(labels.length-1)),y=v=>pad.t+(max-v)*ph/max;
  [{name:"病豬頭數",values:sick,color:"#0f766e"},{name:"死亡頭數",values:deaths,color:"#b91c1c"}].forEach((ser,si)=>{
    ctx.strokeStyle=ser.color;ctx.lineWidth=2.5;ctx.beginPath();
    ser.values.forEach((v,i)=>{if(i===0)ctx.moveTo(x(i),y(v));else ctx.lineTo(x(i),y(v));});ctx.stroke();
    ser.values.forEach((v,i)=>{ctx.fillStyle=ser.color;ctx.beginPath();ctx.arc(x(i),y(v),3,0,Math.PI*2);ctx.fill();});
    ctx.fillStyle=ser.color;ctx.fillRect(pad.l+si*120,pad.t-12,10,3);ctx.fillStyle="#334155";ctx.textAlign="left";ctx.fillText(ser.name,pad.l+14+si*120,pad.t-8);
  });
  ctx.fillStyle="#64748b";ctx.textAlign="center";
  labels.forEach((lab,i)=>{if(labels.length<=8||i%Math.ceil(labels.length/8)===0)ctx.fillText(lab.slice(5),x(i),h-14);});
}
$("#dashboardRefresh").onclick=renderDashboard;
$("#dashboardNewCase").onclick=()=>{switchTab("tracker");prepareNewTrackedCase({});};
$("#dashboardCaseFilter").onchange=()=>renderDashboardCaseTable(activeTrackedCases());
$("#dashboardRange").onchange=renderFarmTrendChart;
window.addEventListener("resize",()=>{if($("#tab-dashboard")?.classList.contains("active")){renderFarmTrendChart();drawRiskRadar();}});
renderDashboard();

/* ---------- V7 Longitudinal Case Tracker ---------- */
function saveTrackedCases(){
  localStorage.setItem("pigTrackedCases",JSON.stringify(trackedCases)); markLocalChanged();
}
function trackedCaseById(id){
  return trackedCases.find(c=>String(c.id)===String(id));
}
function todayLocal(){
  const d=new Date(), z=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}
function statusLabel(s){
  return s==="closed"?"已結案":s==="watch"?"持續觀察":"追蹤中";
}
function statusClass(s){
  return s==="closed"?"status-closed":s==="watch"?"status-watch":"status-open";
}
function caseDiseaseName(c){
  if(Number.isInteger(c.diseaseIndex) && diseases[c.diseaseIndex]) return diseaseLabel(diseases[c.diseaseIndex]);
  return c.diseaseName||"尚未確定";
}
function caseDiseaseLabel(c){ return caseDiseaseName(c); }
function caseDiseaseSearchText(c){
  if(Number.isInteger(c?.diseaseIndex) && diseases[c.diseaseIndex]) return diseaseSearchBlob(diseases[c.diseaseIndex]);
  return c?.diseaseName||"";
}
function caseLatest(c){
  const arr=(c.entries||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))); return arr.length?arr[arr.length-1]:null;
}
function cumulativeDeaths(c){
  return (c.entries||[]).reduce((sum,e)=>sum+(Number(e.deaths)||0),0);
}
function caseDayNumber(c,date){
  const a=new Date((c.startDate||date)+"T00:00:00");
  const b=new Date((date||c.startDate)+"T00:00:00");
  if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime())) return 0;
  return Math.max(0,Math.round((b-a)/86400000));
}
function numOrNull(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v); return Number.isFinite(n)?n:null;
}
function trendBurden(entry){
  if(!entry)return null;
  let x=0;
  const sick=numOrNull(entry.sick); if(sick!==null) x+=sick*1.1;
  const deaths=numOrNull(entry.deaths); if(deaths!==null) x+=deaths*5;
  const temp=numOrNull(entry.temp); if(temp!==null) x+=Math.max(0,temp-39.5)*3;
  const feed=numOrNull(entry.feed); if(feed!==null) x+=Math.max(0,100-feed)*0.12;
  const water=numOrNull(entry.water); if(water!==null) x+=Math.max(0,100-water)*0.08;
  const resp=numOrNull(entry.resp); if(resp!==null) x+=resp*2.5;
  const diarrhea=numOrNull(entry.diarrhea); if(diarrhea!==null) x+=diarrhea*2.5;
  return x;
}
function caseTrend(c){
  const arr=(c.entries||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(arr.length<2) return {kind:"stable",label:"資料不足",text:"至少需要 2 筆不同日期的追蹤紀錄，才能比較趨勢。"};
  const prev=trendBurden(arr[arr.length-2]), cur=trendBurden(arr[arr.length-1]);
  if(prev===null||cur===null) return {kind:"stable",label:"資料不足",text:"目前可比較的量化欄位不足。"};
  const diff=cur-prev;
  const denom=Math.max(5,Math.abs(prev));
  const pct=diff/denom;
  if(pct<=-0.12) return {kind:"improving",label:"趨勢改善",text:`最近一筆綜合疾病負擔指標較前一筆下降約 ${Math.round(Math.abs(pct)*100)}%。這是追蹤趨勢，不等於治療已證實有效。`};
  if(pct>=0.12) return {kind:"worsening",label:"趨勢惡化",text:`最近一筆綜合疾病負擔指標較前一筆上升約 ${Math.round(Math.abs(pct)*100)}%。建議重新檢視診斷、採樣、處置與環境因素。`};
  return {kind:"stable",label:"大致持平",text:"最近兩筆量化指標變化不大，建議持續追蹤，不要只靠單一天判斷處置成效。"};
}
function renderTrackedCases(){
  const q=normalize($("#trackerSearch")?.value||"");
  const status=$("#trackerStatusFilter")?.value||"";
  let arr=trackedCases.slice().sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  arr=arr.filter(c=>{
    if(status && c.status!==status)return false;
    if(q){
      const hay=normalize([c.name,c.barn,c.pen,c.ageGroup,caseDiseaseLabel(c),c.symptoms].join(" "));
      if(!hay.includes(q))return false;
    }
    return true;
  });
  $("#trackedCaseList").innerHTML=arr.length?arr.map(c=>{
    const latest=caseLatest(c), trend=caseTrend(c);
    return `<button class="tracked-case-item ${String(activeTrackedCaseId)===String(c.id)?"active":""}" onclick="selectTrackedCase('${c.id}')">
      <div><span class="status-dot ${statusClass(c.status)}"></span><span class="case-card-time">${statusLabel(c.status)} · ${esc(c.startDate||"")}</span></div>
      <h4>${esc(c.name||"未命名病例")}</h4>
      <p>${esc([c.barn,c.pen,c.ageGroup].filter(Boolean).join(" · "))}</p>
      <p>${esc(caseDiseaseLabel(c))}${latest?` · 最新病豬 ${latest.sick??"-"} · 今日死亡 ${latest.deaths??"-"}`:""}</p>
      <p>${esc(trend.label)}</p>
    </button>`;
  }).join(""):`<p class="muted">沒有符合條件的追蹤病例。</p>`;

  if(activeTrackedCaseId && trackedCaseById(activeTrackedCaseId)) renderTrackedCaseDetail();
  else {
    $("#trackerDetail").classList.add("hidden");
    $("#trackerEmpty").classList.remove("hidden");
  }
}
window.selectTrackedCase=(id)=>{
  activeTrackedCaseId=id;
  renderTrackedCases();
  renderTrackedCaseDetail();
};
function trackedCaseKpis(c){
  const latest=caseLatest(c);
  const head=Number(c.headcount)||0;
  const deaths=cumulativeDeaths(c);
  const mortality=head?deaths/head*100:null;
  const morbidity=head&&latest&&latest.sick!==null&&latest.sick!==""?Number(latest.sick)/head*100:null;
  return [
    ["病例群頭數",head||"—","頭"],
    ["目前病豬",latest?.sick??"—","頭"],
    ["累計死亡",deaths,"頭"],
    ["累計死亡率",mortality===null?"—":mortality.toFixed(1),mortality===null?"":"%"],
    ["目前發病率",morbidity===null?"—":morbidity.toFixed(1),morbidity===null?"":"%"],
    ["最新採食",latest?.feed??"—",latest?.feed!==null&&latest?.feed!==undefined&&latest?.feed!==""?"%":""]
  ];
}
function renderTrackedCaseDetail(){
  const c=trackedCaseById(activeTrackedCaseId);
  if(!c)return;
  $("#trackerEmpty").classList.add("hidden");
  $("#trackerDetail").classList.remove("hidden");
  $("#trackerCaseMeta").textContent=`${statusLabel(c.status)} · 開始 ${c.startDate||"未填日期"}`;
  $("#trackerCaseTitle").textContent=c.name||"未命名病例";
  $("#trackerCaseBadges").innerHTML=[
    c.barn,c.pen,c.ageGroup,caseDiseaseLabel(c)
  ].filter(Boolean).map(x=>`<span class="badge">${esc(x)}</span>`).join("");
  $("#trackerCaseStatus").value=c.status||"open";
  if(!$("#sendTrackedCaseToLab")){
    const btn=document.createElement("button");
    btn.id="sendTrackedCaseToLab";btn.className="secondary";btn.textContent="建立送檢";
    btn.onclick=()=>createLabOrderFromCase(activeTrackedCaseId);
    $("#printTrackedCase").before(btn);
  }
  if(!$("#startTreatmentFromCase")){
    const btn=document.createElement("button");
    btn.id="startTreatmentFromCase";btn.className="secondary";btn.textContent="建立治療方案";
    btn.onclick=()=>createTreatmentFromCase(activeTrackedCaseId);
    $("#printTrackedCase").before(btn);
  }

  $("#trackerKpis").innerHTML=trackedCaseKpis(c).map(([k,v,u])=>`
    <div class="tracker-kpi"><span>${esc(k)}</span><b>${esc(String(v))}${esc(u||"")}</b></div>`).join("");

  const trend=caseTrend(c);
  $("#trackerTrendNotice").className=`tracker-trend ${trend.kind}`;
  $("#trackerTrendNotice").innerHTML=`<b>${esc(trend.label)}</b><br>${esc(trend.text)}`;

  const entries=(c.entries||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const suggestedDay=entries.length?caseDayNumber(c,todayLocal()):0;
  $("#trackerNextDay").textContent=`今日：Day ${suggestedDay}`;
  $("#trackDate").value=todayLocal();

  $("#trackerTimeline").innerHTML=entries.length?entries.slice().reverse().map((e,revIndex)=>{
    const actualIndex=entries.length-1-revIndex;
    return `<article class="timeline-item">
      <div class="timeline-top">
        <div><div class="eyebrow">DAY ${caseDayNumber(c,e.date)}</div><h4>${esc(e.date||"未填日期")}</h4></div>
        <span class="badge">${esc(e.temp?`${e.temp}℃`:"無體溫")}</span>
      </div>
      <div class="timeline-metrics">
        <span class="badge">病豬 ${esc(String(e.sick??"—"))}</span>
        <span class="badge">死亡 ${esc(String(e.deaths??"—"))}</span>
        <span class="badge">採食 ${esc(e.feed!==null&&e.feed!==undefined&&e.feed!==""?`${e.feed}%`:"—")}</span>
        <span class="badge">飲水 ${esc(e.water!==null&&e.water!==undefined&&e.water!==""?`${e.water}%`:"—")}</span>
        <span class="badge">呼吸 ${esc(String(e.resp??"—"))}</span>
        <span class="badge">腹瀉 ${esc(String(e.diarrhea??"—"))}</span>
      </div>
      ${e.action?`<div class="timeline-note"><b>處置：</b>${esc(e.action)}</div>`:""}
      ${e.note?`<div class="timeline-note"><b>觀察：</b>${esc(e.note)}</div>`:""}
      <div class="timeline-actions"><button class="secondary" onclick="deleteTrackedEntry('${c.id}',${actualIndex})">刪除此筆</button></div>
    </article>`;
  }).join(""):`<p class="muted">尚無追蹤紀錄。</p>`;

  drawTrackedCharts(c);
}
function prepareNewTrackedCase(template={}){
  pendingTrackedCaseTemplate=template||{};
  $("#newCaseName").value=template.name||"";
  $("#newCaseBarn").value=template.barn||"";
  $("#newCasePen").value=template.pen||"";
  $("#newCaseAgeGroup").value=template.ageGroup||"";
  $("#newCaseStartDate").value=template.startDate||todayLocal();
  $("#newCaseHeadcount").value=template.headcount||"";
  $("#newCaseSick").value=template.sick||"";
  $("#newCaseDead").value=template.dead||"";
  $("#newCaseDisease").value=Number.isInteger(template.diseaseIndex)?String(template.diseaseIndex):"";
  $("#newCaseSymptoms").value=template.symptoms||"";
  $("#newCaseInitialAction").value=template.initialAction||"";
  $("#trackedCaseDialog").showModal();
}
$("#newTrackedCase").onclick=()=>prepareNewTrackedCase({});
$("#closeTrackedCaseDialog").onclick=()=>$("#trackedCaseDialog").close();

function initTrackedCaseDiseaseSelect(){
  diseases.forEach((d,i)=>$("#newCaseDisease").insertAdjacentHTML("beforeend",`<option value="${i}">${esc(diseaseLabel(d))}｜${esc(d.category)}</option>`));
}
initTrackedCaseDiseaseSelect();

$("#saveNewTrackedCase").onclick=()=>{
  const id=Date.now();
  const diseaseValue=$("#newCaseDisease").value;
  const diseaseIndex=diseaseValue===""?null:Number(diseaseValue);
  const c={
    id,
    name:$("#newCaseName").value.trim()||`病例 ${new Date().toLocaleDateString()}`,
    barn:$("#newCaseBarn").value.trim(),
    pen:$("#newCasePen").value.trim(),
    ageGroup:$("#newCaseAgeGroup").value,
    startDate:$("#newCaseStartDate").value||todayLocal(),
    headcount:numOrNull($("#newCaseHeadcount").value),
    diseaseIndex:Number.isInteger(diseaseIndex)?diseaseIndex:null,
    diseaseName:Number.isInteger(diseaseIndex)&&diseases[diseaseIndex]?diseases[diseaseIndex].name:"",
    symptoms:$("#newCaseSymptoms").value.trim(),
    status:"open",
    createdAt:Date.now(),
    updatedAt:Date.now(),
    entries:[{
      date:$("#newCaseStartDate").value||todayLocal(),
      sick:numOrNull($("#newCaseSick").value),
      deaths:numOrNull($("#newCaseDead").value)||0,
      temp:null,feed:null,water:null,resp:null,diarrhea:null,
      action:$("#newCaseInitialAction").value.trim(),
      note:"Day 0 初始紀錄"
    }]
  };
  trackedCases.unshift(c);saveTrackedCases();
  activeTrackedCaseId=id;
  $("#trackedCaseDialog").close();
  switchTab("tracker");
  renderTrackedCases();renderTrackedCaseDetail();
};

window.createTrackedCaseFromDisease=(idx)=>{
  const d=diseases[idx]; if(!d)return;
  const template={
    diseaseIndex:idx,
    name:`${$("#ageGroup")?.value||""}${$("#ageGroup")?.value?" ":""}${d.name}追蹤`,
    ageGroup:$("#ageGroup")?.value||"",
    startDate:todayLocal(),
    symptoms:[$("#symptomText")?.value.trim()||"",$("#lesionText")?.value.trim()||""].filter(Boolean).join("；"),
    sick:"",
    dead:""
  };
  switchTab("tracker");
  prepareNewTrackedCase(template);
};

$("#trackerSearch").addEventListener("input",renderTrackedCases);
$("#trackerStatusFilter").addEventListener("change",renderTrackedCases);
$("#trackerCaseStatus").onchange=e=>{
  const c=trackedCaseById(activeTrackedCaseId); if(!c)return;
  c.status=e.target.value;c.updatedAt=Date.now();saveTrackedCases();renderTrackedCases();
};

$("#saveTrackEntry").onclick=()=>{
  const c=trackedCaseById(activeTrackedCaseId); if(!c)return;
  const e={
    date:$("#trackDate").value||todayLocal(),
    sick:numOrNull($("#trackSick").value),
    deaths:numOrNull($("#trackDeaths").value)||0,
    temp:numOrNull($("#trackTemp").value),
    feed:numOrNull($("#trackFeed").value),
    water:numOrNull($("#trackWater").value),
    resp:numOrNull($("#trackResp").value),
    diarrhea:numOrNull($("#trackDiarrhea").value),
    action:$("#trackAction").value.trim(),
    note:$("#trackNote").value.trim()
  };
  c.entries=c.entries||[];c.entries.push(e);c.entries.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  c.updatedAt=Date.now();saveTrackedCases();
  ["#trackSick","#trackDeaths","#trackTemp","#trackFeed","#trackWater","#trackResp","#trackDiarrhea","#trackAction","#trackNote"].forEach(sel=>$(sel).value="");
  renderTrackedCases();renderTrackedCaseDetail();
};
window.deleteTrackedEntry=(caseId,index)=>{
  const c=trackedCaseById(caseId); if(!c)return;
  const arr=(c.entries||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!arr[index])return;
  const target=arr[index];
  const originalIndex=c.entries.indexOf(target);
  if(originalIndex>=0)c.entries.splice(originalIndex,1);
  c.updatedAt=Date.now();saveTrackedCases();renderTrackedCases();renderTrackedCaseDetail();
};
$("#deleteTrackedCase").onclick=()=>{
  const c=trackedCaseById(activeTrackedCaseId);if(!c)return;
  if(!confirm(`確定刪除病例「${c.name}」？`))return;
  trackedCases=trackedCases.filter(x=>String(x.id)!==String(c.id));saveTrackedCases();
  activeTrackedCaseId=null;renderTrackedCases();
};
$("#printTrackedCase").onclick=()=>window.print();

function csvEscape(v){
  const s=String(v??"");
  return `"${s.replace(/"/g,'""')}"`;
}
function downloadBlob(filename,content,type){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}
$("#exportTrackedCaseCsv").onclick=()=>{
  const c=trackedCaseById(activeTrackedCaseId);if(!c)return;
  const head=["Day","日期","目前病豬","今日死亡","體溫","採食%","飲水%","呼吸0-3","腹瀉0-3","處置","觀察"];
  const rows=(c.entries||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map((e,i)=>[
    i,e.date,e.sick,e.deaths,e.temp,e.feed,e.water,e.resp,e.diarrhea,e.action,e.note
  ]);
  const csv="\ufeff"+[head,...rows].map(r=>r.map(csvEscape).join(",")).join("\n");
  downloadBlob(`${c.name||"病例追蹤"}.csv`,csv,"text/csv;charset=utf-8");
};
$("#exportTrackedCases").onclick=()=>{
  downloadBlob(`豬病追蹤病例_${todayLocal()}.json`,JSON.stringify(trackedCases,null,2),"application/json;charset=utf-8");
};

function drawLineChart(canvas,labels,series){
  if(!canvas)return;
  const rect=canvas.getBoundingClientRect(), ratio=window.devicePixelRatio||1;
  const w=Math.max(320,rect.width||600), h=220;
  canvas.width=w*ratio;canvas.height=h*ratio;canvas.style.height=h+"px";
  const ctx=canvas.getContext("2d");ctx.scale(ratio,ratio);ctx.clearRect(0,0,w,h);
  const pad={l:42,r:18,t:18,b:34},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
  ctx.strokeStyle="#cbd5e1";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(pad.l,pad.t);ctx.lineTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
  const values=series.flatMap(s=>s.values.filter(v=>v!==null&&Number.isFinite(v)));
  if(!values.length){ctx.fillStyle="#64748b";ctx.fillText("尚無足夠數值",pad.l+10,pad.t+30);return;}
  let min=Math.min(...values,0),max=Math.max(...values,1);if(max===min)max=min+1;
  const x=i=>pad.l+(labels.length<=1?pw/2:i*pw/(labels.length-1));
  const y=v=>pad.t+(max-v)*ph/(max-min);
  ctx.font="11px sans-serif";ctx.fillStyle="#64748b";ctx.textAlign="right";
  for(let k=0;k<=4;k++){const val=min+(max-min)*(4-k)/4, yy=pad.t+ph*k/4;ctx.fillText(val.toFixed(0),pad.l-6,yy+4);ctx.strokeStyle="#eef2f7";ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();}
  series.forEach((ser,si)=>{
    ctx.strokeStyle=si===0?"#0f766e":"#7c3aed";ctx.lineWidth=2.4;ctx.beginPath();let started=false;
    ser.values.forEach((v,i)=>{if(v===null||!Number.isFinite(v))return;const xx=x(i),yy=y(v);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy);});
    ctx.stroke();
    ser.values.forEach((v,i)=>{if(v===null||!Number.isFinite(v))return;ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x(i),y(v),3.2,0,Math.PI*2);ctx.fill();});
  });
  ctx.textAlign="center";ctx.fillStyle="#64748b";
  labels.forEach((lab,i)=>{if(labels.length<=8||i%Math.ceil(labels.length/8)===0)ctx.fillText(lab,x(i),h-12);});
  ctx.textAlign="left";
  series.forEach((ser,si)=>{ctx.fillStyle=si===0?"#0f766e":"#7c3aed";ctx.fillRect(pad.l+si*120,pad.t-10,10,3);ctx.fillStyle="#334155";ctx.fillText(ser.name,pad.l+14+si*120,pad.t-6);});
}
function drawBarChart(canvas,labels,values){
  if(!canvas)return;
  const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1,w=Math.max(320,rect.width||600),h=220;
  canvas.width=w*ratio;canvas.height=h*ratio;canvas.style.height=h+"px";const ctx=canvas.getContext("2d");ctx.scale(ratio,ratio);ctx.clearRect(0,0,w,h);
  const pad={l:42,r:18,t:18,b:34},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,max=Math.max(1,...values.map(v=>Number(v)||0));
  ctx.strokeStyle="#cbd5e1";ctx.beginPath();ctx.moveTo(pad.l,pad.t);ctx.lineTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
  const bw=Math.max(4,pw/Math.max(1,values.length)*0.55);
  values.forEach((v,i)=>{const n=Number(v)||0,xx=pad.l+(i+.5)*pw/values.length-bw/2,hh=n/max*ph;ctx.fillStyle="#b91c1c";ctx.fillRect(xx,h-pad.b-hh,bw,hh);});
  ctx.font="11px sans-serif";ctx.fillStyle="#64748b";ctx.textAlign="center";
  labels.forEach((lab,i)=>{if(labels.length<=8||i%Math.ceil(labels.length/8)===0)ctx.fillText(lab,pad.l+(i+.5)*pw/labels.length,h-12);});
}
function drawTrackedCharts(c){
  const arr=(c.entries||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const labels=arr.map(e=>`D${caseDayNumber(c,e.date)}`);
  drawLineChart($("#caseHealthChart"),labels,[
    {name:"病豬頭數",values:arr.map(e=>numOrNull(e.sick))},
    {name:"採食 %",values:arr.map(e=>numOrNull(e.feed))}
  ]);
  drawBarChart($("#caseDeathChart"),labels,arr.map(e=>numOrNull(e.deaths)||0));
}
window.addEventListener("resize",()=>{const c=trackedCaseById(activeTrackedCaseId);if(c && !$("#trackerDetail").classList.contains("hidden"))drawTrackedCharts(c);});

renderTrackedCases();

/* ---------- V6 Farm Action Plan ---------- */
function actionKey(idx){ return `d_${idx}`; }

function sourceText(d, key){
  const v=d.sections?.[key]||"";
  return v.trim();
}

function immediateActionsFor(d){
  const tags=new Set(d.symptom_tags||[]);
  const out=[
    "將明顯異常豬與健康豬分流，避免同一器具直接跨欄／跨舍使用。",
    "記錄發病棟舍、欄位、日齡、發病頭數、死亡頭數與開始日期。",
    "保留急性期病豬與新鮮死亡豬的採樣條件，避免樣本腐敗或被後續處置影響。"
  ];
  if(tags.has("呼吸困難")||tags.has("咳嗽")) out.push("降低趕豬與混群刺激，先確認通風、溫度、飲水與欄內密度。");
  if(tags.has("腹瀉")||tags.has("嘔吐")) out.push("優先確認飲水可及性與脫水風險，並分開處理污染糞便與器具。");
  if(tags.has("神經症狀")) out.push("將神經症狀豬隔離於安全欄位，避免碰撞、踩壓與群體攻擊。");
  if(tags.has("流產/繁殖障礙")) out.push("流產胎兒、胎盤與污染墊料應獨立處理並保留代表性樣本。");
  if(tags.has("猝死")||tags.has("仔豬高死亡")) out.push("若短時間死亡快速增加，優先啟動獸醫與必要檢驗，不要只依單一疾病直接用藥。");
  return uniq(out);
}

function diagnosticActionsFor(d){
  const out=[];
  if(sourceText(d,"diagnosis")) out.push("先對照下方「原書診斷重點」，確認哪些臨床／病理線索尚未取得。");
  sampleSuggestions(d).forEach(x=>out.push(`採樣可考慮：${x}`));
  if(d.sections?.pathology) out.push("若有死亡豬，拍攝主要器官病變並和本系統圖譜／病理文字交叉比對。");
  out.push("若候選疾病彼此相近，應用適合的實驗室檢驗繼續區分，而不是把相對匹配度當成確診。");
  return uniq(out);
}

function environmentActionsFor(d){
  const tags=new Set(d.symptom_tags||[]);
  const out=[
    "量測實際舍溫與濕度，並檢查最小通風是否正常。",
    "確認水嘴流量、水壓與飲水可及性。",
    "檢查欄內密度、混群／轉欄、近期換料與清洗後乾燥狀況。"
  ];
  if(tags.has("呼吸困難")||tags.has("咳嗽")||tags.has("鼻液")) {
    out.push("降低氨氣、粉塵與過度潮濕；確認進排風沒有短路。");
    out.push("避免日夜溫差過大與直接冷風打在豬體。");
  }
  if(tags.has("腹瀉")||tags.has("嘔吐")) {
    out.push("檢查飲水衛生、料槽污染、糞污回濺與批次間清洗乾燥。");
  }
  if(tags.has("皮膚病灶")||tags.has("搔癢")) out.push("保持皮膚與欄面乾燥，檢查粗糙表面、寄生蟲與互咬因素。");
  if(tags.has("流產/繁殖障礙")) out.push("檢查母豬熱緊迫、飲水、黴菌毒素風險與配種／妊娠管理變化。");
  return uniq(out);
}

function biosecurityActionsFor(d){
  return [
    "人員照顧順序由健康／低風險區到異常／高風險區，異常區工作後更換或清潔消毒器具與鞋靴。",
    "避免同一針具、推車、板子、掃具或治療器具未清潔就跨欄／跨舍。",
    "病死豬、胎衣、流產物與污染物走固定路線，避免回穿健康區。",
    "新增病例期間，減少非必要移豬、混群與外來人車進入。",
    "保留清洗、乾燥、消毒與空舍紀錄，方便回查可能的傳播節點。"
  ];
}

function monitoringMetricsFor(d){
  const tags=new Set(d.symptom_tags||[]);
  const arr=[
    ["發病率","每日新增病豬 ÷ 在欄頭數"],
    ["死亡率","每日死亡與累計死亡"],
    ["體溫","固定時段抽測代表性病豬"],
    ["採食量","和前 3–7 天基準比較"],
    ["飲水","飲水量／水嘴流量異常"]
  ];
  if(tags.has("腹瀉")) arr.push(["腹瀉率","同欄腹瀉頭數與糞便型態"]);
  if(tags.has("呼吸困難")||tags.has("咳嗽")) arr.push(["呼吸症狀率","咳嗽、喘氣、腹式呼吸頭數"]);
  if(tags.has("流產/繁殖障礙")) arr.push(["繁殖事件","流產、死胎、木乃伊、返情與弱仔"]);
  if(tags.has("跛行/關節")) arr.push(["跛行率","不能正常負重／關節腫大頭數"]);
  return arr;
}

function treatmentSourceFor(d){
  const parts=[];
  if(sourceText(d,"treatment")) parts.push(sourceText(d,"treatment"));
  if(sourceText(d,"formula")) parts.push("【方劑】\n"+sourceText(d,"formula"));
  if(!parts.length && sourceText(d,"control")) {
    const ctl=sourceText(d,"control");
    if(/治療|藥|注射|口服|劑量|療法/.test(ctl)) parts.push("本疾病未分出獨立「治療」段落，原書防治段落可能包含治療資訊：\n"+ctl);
  }
  return parts.join("\n\n").trim();
}

function renderChecklist(containerId, items, idx, section){
  const key=actionKey(idx);
  const state=actionChecklistState[key]?.[section]||{};
  $(containerId).innerHTML=items.map((txt,i)=>{
    const checked=!!state[i];
    return `<label class="check-row ${checked?"done":""}">
      <input type="checkbox" ${checked?"checked":""} onchange="toggleActionCheck(${idx},'${section}',${i},this.checked)">
      <span>${esc(txt)}</span>
    </label>`;
  }).join("");
}

window.toggleActionCheck=(idx,section,i,checked)=>{
  const key=actionKey(idx);
  actionChecklistState[key]=actionChecklistState[key]||{};
  actionChecklistState[key][section]=actionChecklistState[key][section]||{};
  actionChecklistState[key][section][i]=checked;
  localStorage.setItem("pigActionChecklist",JSON.stringify(actionChecklistState)); markLocalChanged();
  if(currentActionDiseaseIndex===idx) renderActionPlan(idx,false);
};

function renderActionPlan(idx,scroll=true){
  const d=diseases[idx]; if(!d)return;
  currentActionDiseaseIndex=idx;
  $("#actionEmpty").classList.add("hidden");
  $("#actionPlan").classList.remove("hidden");
  $("#actionDiseaseSelect").value=String(idx);
  $("#actionDiseaseSearch").value=d.name;
  $("#actionCategory").textContent=`${d.category} · 原書頁 ${d.print_page}`;
  $("#actionTitle").textContent=diseaseLabel(d);
  $("#actionTags").innerHTML=(d.symptom_tags||[]).slice(0,10).map(t=>`<span class="badge">${esc(t)}</span>`).join("");

  renderChecklist("#actionImmediate",immediateActionsFor(d),idx,"immediate");
  renderChecklist("#actionDiagnostics",diagnosticActionsFor(d),idx,"diagnostics");
  renderChecklist("#actionEnvironment",environmentActionsFor(d),idx,"environment");
  renderChecklist("#actionBiosecurity",biosecurityActionsFor(d),idx,"biosecurity");

  const control=sourceText(d,"control")||sourceText(d,"prevention");
  $("#actionControl").className="source-box"+(control?"":" empty");
  $("#actionControl").textContent=control||"原書此疾病條目未擷取到獨立的防治／預防段落。";

  const treatment=treatmentSourceFor(d);
  $("#actionTreatment").className="source-box"+(treatment?"":" empty");
  $("#actionTreatment").textContent=treatment||"原書此疾病條目未擷取到獨立的治療／方劑內容。";

  const diagnosis=sourceText(d,"diagnosis");
  $("#actionDiagnosisSource").className="source-box"+(diagnosis?"":" empty");
  $("#actionDiagnosisSource").textContent=diagnosis||"原書此疾病條目未擷取到獨立的診斷段落。";

  $("#actionMonitoring").innerHTML=monitoringMetricsFor(d).map(([name,desc])=>`
    <div class="metric"><b>${esc(name)}</b><span>${esc(desc)}</span><input placeholder="今日紀錄／備註"></div>`).join("");

  if(scroll) $("#actionPlan").scrollIntoView({behavior:"smooth",block:"start"});
}
window.renderActionPlan=renderActionPlan;

window.openActionPlan=(idx)=>{
  switchTab("action");
  renderActionPlan(idx,true);
};

function initActionDiseaseSelect(){
  const sel=$("#actionDiseaseSelect");
  diseases.forEach((d,i)=>sel.insertAdjacentHTML("beforeend",`<option value="${i}">${esc(diseaseLabel(d))}｜${esc(d.category)}</option>`));
}
$("#actionDiseaseSelect").onchange=e=>{
  const idx=+e.target.value;
  if(Number.isInteger(idx) && idx>=0) renderActionPlan(idx,true);
};
$("#actionDiseaseSearch").addEventListener("input",e=>{
  const q=normalize(e.target.value);
  if(!q)return;
  const hit=diseases.findIndex(d=>normalize(diseaseSearchBlob(d)).includes(q));
  if(hit>=0) $("#actionDiseaseSelect").value=String(hit);
});
$("#actionDiseaseSearch").addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    const q=normalize(e.target.value);
    const hit=diseases.findIndex(d=>normalize(diseaseSearchBlob(d)).includes(q));
    if(hit>=0) renderActionPlan(hit,true);
  }
});
$("#openActionDiseaseDetail").onclick=()=>{ if(currentActionDiseaseIndex!==null) openDetail(currentActionDiseaseIndex); };
$("#resetActionChecklist").onclick=()=>{
  if(currentActionDiseaseIndex===null)return;
  delete actionChecklistState[actionKey(currentActionDiseaseIndex)];
  localStorage.setItem("pigActionChecklist",JSON.stringify(actionChecklistState)); markLocalChanged();
  renderActionPlan(currentActionDiseaseIndex,false);
};
$("#printActionPlan").onclick=()=>window.print();
initActionDiseaseSelect();

/* ---------- V5 Image Atlas ---------- */
function atlasAllOrgans(){
  return [...new Set(pigImages.flatMap(x=>x.organs||[]))].sort();
}
function initAtlasFilters(){
  if(!$("#atlasOrganFilter")) return;
  atlasAllOrgans().forEach(o=>$("#atlasOrganFilter").insertAdjacentHTML("beforeend",`<option>${esc(o)}</option>`));
  [...new Set(diseases.map(d=>d.category))].forEach(c=>$("#atlasCategoryFilter").insertAdjacentHTML("beforeend",`<option>${esc(c)}</option>`));
}
function atlasFiltered(){
  const q=normalize($("#atlasSearch")?.value||"");
  const typ=$("#atlasTypeFilter")?.value||"";
  const organ=$("#atlasOrganFilter")?.value||"";
  const cat=$("#atlasCategoryFilter")?.value||"";
  return pigImages.filter(im=>{
    if(typ && im.image_type!==typ) return false;
    if(organ && !(im.organs||[]).includes(organ)) return false;
    if(cat && im.category!==cat) return false;
    if(q){
      const hay=normalize([im.disease,im.disease_abbr,im.figure,im.caption,im.category,(im.organs||[]).join(" "),im.image_type].join(" "));
      const parts=q.split(/[，,、 ]+/).filter(Boolean);
      if(!(hay.includes(q)||parts.every(x=>hay.includes(x)))) return false;
    }
    return true;
  });
}
function renderAtlas(reset=false){
  if(!$("#atlasGrid")) return;
  if(reset) atlasLimit=72;
  const arr=atlasFiltered();
  $("#atlasCount").textContent=`符合 ${arr.length} 張；目前顯示 ${Math.min(arr.length,atlasLimit)} 張`;
  $("#atlasGrid").classList.toggle("large",atlasLargeView);
  const show=arr.slice(0,atlasLimit);
  $("#atlasGrid").innerHTML=show.map(im=>{
    const globalIndex=pigImages.indexOf(im);
    return `<article class="atlas-card">
      <button onclick="openAtlasImage(${globalIndex})">
        <div class="atlas-img-wrap"><img loading="lazy" src="${im.src}" alt="${esc(imageDiseaseLabel(im))}"></div>
        <div class="atlas-info">
          <div class="atlas-mini">
            <span class="badge">${esc(im.image_type||"其他")}</span>
            ${(im.organs||[]).slice(0,2).map(o=>`<span class="badge">${esc(o)}</span>`).join("")}
          </div>
          <h4>${esc(imageDiseaseLabel(im))}</h4>
          <div class="atlas-caption">${esc([im.figure,im.caption].filter(Boolean).join("｜") || "此圖片尚未逐圖對應原書圖說")}</div>
          <div class="atlas-source">PDF 第 ${im.pdf_page} 頁 · ${esc(im.caption_source||"")}</div>
        </div>
      </button>
    </article>`;
  }).join("");
  $("#atlasLoadMore").classList.toggle("hidden",atlasLimit>=arr.length);
}
window.openAtlasImage=(idx)=>{
  const im=pigImages[idx]; if(!im)return;
  currentAtlasImage=im;
  $("#imageDialogMeta").textContent=`${im.category} · ${im.image_type} · PDF 第 ${im.pdf_page} 頁`;
  $("#imageDialogTitle").textContent=imageDiseaseLabel(im);
  $("#imageDialogImg").src=im.src;
  $("#imageDialogFigure").textContent=im.figure||"圖譜圖片";
  $("#imageDialogCaption").textContent=im.caption||"這張圖片目前只確認屬於該疾病條目頁面，未建立逐圖圖說對應。";
  $("#imageDialogSource").textContent=im.caption_source||"原書頁面圖片";
  $("#imageDialog").showModal();
};
$("#closeImageDialog").onclick=()=>$("#imageDialog").close();
$("#openImageDisease").onclick=()=>{
  if(!currentAtlasImage)return;
  $("#imageDialog").close();
  openDetail(currentAtlasImage.disease_index);
};
["#atlasSearch","#atlasTypeFilter","#atlasOrganFilter","#atlasCategoryFilter"].forEach(sel=>{
  const el=$(sel);
  if(el) el.addEventListener(el.tagName==="INPUT"?"input":"change",()=>renderAtlas(true));
});
$("#clearAtlasFilters").onclick=()=>{
  $("#atlasSearch").value="";
  $("#atlasTypeFilter").value="";
  $("#atlasOrganFilter").value="";
  $("#atlasCategoryFilter").value="";
  renderAtlas(true);
};
$("#atlasLoadMore").onclick=()=>{atlasLimit+=72;renderAtlas(false);};
$("#atlasCompact").onclick=()=>{atlasLargeView=false;renderAtlas(false);};
$("#atlasLarge").onclick=()=>{atlasLargeView=true;renderAtlas(false);};
initAtlasFilters();
renderAtlas(true);

/* ---------- V4 Necropsy / Organ lesion finder ---------- */
function pathologyText(d){
  return `${d.sections?.pathology||""}\n${d.sections?.clinical||""}`;
}
function organDiseaseCount(organName){
  const def=organDefs[organName], keys=def.organKeywords||[];
  return diseases.filter(d=>keys.some(k=>pathologyText(d).includes(k))).length;
}
function renderOrganGrid(){
  $("#organGrid").innerHTML=Object.entries(organDefs).map(([name,def])=>`
    <button class="organ-card ${selectedOrgan===name?"active":""}" data-organ="${esc(name)}">
      <span class="organ-icon">${def.icon}</span>
      <span><b>${esc(name)}</b><br><span class="organ-count">圖譜中約 ${organDiseaseCount(name)} 項疾病有相關病理文字</span></span>
    </button>`).join("");
}
$("#organGrid").onclick=e=>{
  const b=e.target.closest(".organ-card"); if(!b)return;
  selectedOrgan=b.dataset.organ;
  selectedOrganLesions.clear();
  $("#organFreeText").value="";
  renderOrganGrid();
  renderOrganWorkbench();
};
function renderOrganWorkbench(){
  if(!selectedOrgan){$("#organWorkbench").classList.add("hidden");return;}
  const def=organDefs[selectedOrgan];
  $("#organWorkbench").classList.remove("hidden");
  $("#selectedOrganTitle").textContent=selectedOrgan;
  $("#organLesionChips").innerHTML=Object.keys(def.lesions).map(x=>`<button class="chip" data-organ-lesion="${esc(x)}">${esc(x)}</button>`).join("");
  $("#organDiseaseResults").innerHTML=`<div class="prose"><p>請勾選你實際看到的病變，或直接輸入病變描述後再反查。</p></div>`;
  $("#organResultSummary").classList.add("hidden");
}
$("#organLesionChips").onclick=e=>{
  const b=e.target.closest(".chip"); if(!b)return;
  const x=b.dataset.organLesion;
  selectedOrganLesions.has(x)?selectedOrganLesions.delete(x):selectedOrganLesions.add(x);
  b.classList.toggle("active",selectedOrganLesions.has(x));
};
function pathologyScore(d){
  const def=organDefs[selectedOrgan];
  const path=d.sections?.pathology||"";
  const clinical=d.sections?.clinical||"";
  const all=path+"\n"+clinical;
  let score=0, hits=[], lesionHits=[];
  const organMatches=(def.organKeywords||[]).filter(k=>all.includes(k));
  if(organMatches.length){score+=6+Math.min(organMatches.length,3)*2;hits.push(...organMatches);}
  for(const lesion of selectedOrganLesions){
    const kws=def.lesions[lesion]||[];
    const found=kws.filter(k=>all.includes(k));
    if(found.length){score+=16+Math.min(found.length,2)*2;lesionHits.push(lesion);hits.push(...found);}
  }
  const free=$("#organFreeText").value.trim();
  const tokens=free.split(/[，,。；;、\s]+/).filter(x=>x.length>=2);
  for(const t of tokens){
    if(normalize(all).includes(normalize(t))){score+=8;hits.push(t);}
    else{
      // partial 2-4 char phrase matching for Chinese pathology descriptions
      const nt=normalize(t);
      let best=false;
      for(let len=Math.min(4,nt.length);len>=2&&!best;len--){
        for(let i=0;i<=nt.length-len;i++){
          if(normalize(all).includes(nt.slice(i,i+len))){score+=2;hits.push(nt.slice(i,i+len));best=true;break;}
        }
      }
    }
  }
  return {score,hits:uniq(hits).slice(0,10),lesionHits:uniq(lesionHits)};
}
function sourceExcerpt(d,hits){
  const path=(d.sections?.pathology||"").replace(/\s+/g," ").trim();
  if(!path) return "原書此疾病條目未擷取到明確「病理變化」段落。";
  let pos=-1;
  for(const h of hits||[]){pos=path.indexOf(h);if(pos>=0)break;}
  if(pos<0) pos=0;
  const start=Math.max(0,pos-55), end=Math.min(path.length,pos+210);
  return (start>0?"…":"")+path.slice(start,end)+(end<path.length?"…":"");
}
function renderPathologyResults(){
  if(!selectedOrgan)return;
  const hasInput=selectedOrganLesions.size||$("#organFreeText").value.trim();
  if(!hasInput){
    $("#organDiseaseResults").innerHTML=`<div class="notice">請至少選一項病變或輸入病變描述。</div>`;
    return;
  }
  const ranked=diseases.map((d,i)=>({d,i,...pathologyScore(d)}))
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,15);
  const max=Math.max(1,...ranked.map(x=>x.score));
  $("#organResultSummary").classList.remove("hidden");
  $("#organResultSummary").innerHTML=`<h3>${esc(selectedOrgan)}｜病變反查</h3>
    <div class="summary-grid">
      <div class="summary-item"><b>已選病變</b><br>${esc([...selectedOrganLesions].join("、")||"自由文字")}</div>
      <div class="summary-item"><b>候選疾病</b><br>${ranked.length} 項</div>
      <div class="summary-item"><b>比對依據</b><br>原書病理變化＋臨床文字</div>
    </div>`;
  $("#organDiseaseResults").innerHTML=ranked.length?ranked.map((x,rank)=>{
    const pct=Math.max(1,Math.round(x.score/max*100));
    const imgs=(x.d.images||[]).slice(0,5);
    return `<article class="organ-result-card">
      <div class="organ-result-head">
        <div class="organ-score">${pct}%</div>
        <div>
          <div class="eyebrow">病變候選 ${rank+1} · 相對文字匹配度</div>
          <h3>${esc(diseaseLabel(x.d))}</h3>
          <div>${x.lesionHits.map(v=>`<span class="badge">${esc(v)}</span>`).join("")}</div>
        </div>
      </div>
      <div class="source-hit"><b>原書病理文字節錄：</b><br>${esc(sourceExcerpt(x.d,x.hits))}</div>
      ${imgs.length?`<div class="thumb-strip">${
        imgs.map(im=>`<button title="開啟 ${esc(diseaseLabel(x.d))} 詳細圖譜" onclick="openDetail(${x.i})"><img loading="lazy" src="${im.src}" alt="${esc(diseaseLabel(x.d))} 圖譜"></button>`).join("")
      }</div>`:""}
      <div class="actions">
        <button class="primary" onclick="openDetail(${x.i})">查看完整圖譜與病理</button>
        <button class="secondary" onclick="openActionPlan(${x.i})">處置決策卡</button>
        <button class="secondary" onclick="usePathologyInTriage(${x.i})">帶入病例判斷</button>
      </div>
    </article>`;
  }).join(""):`<div class="notice">目前沒有找到足夠相符的病理文字。可減少條件、改用更簡短的病變詞，或回到病例判斷加入日齡與症狀。</div>`;
}
$("#runPathologySearch").onclick=renderPathologyResults;
$("#organFreeText").addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter")renderPathologyResults();});
$("#clearPathology").onclick=()=>{
  selectedOrgan=null;selectedOrganLesions.clear();$("#organFreeText").value="";
  renderOrganGrid();$("#organWorkbench").classList.add("hidden");
};
window.usePathologyInTriage=(idx)=>{
  const d=diseases[idx];
  const lesionText=$("#organFreeText").value.trim();
  const chosen=[...selectedOrganLesions].join("、");
  $("#lesionText").value=[chosen,lesionText].filter(Boolean).join("；");
  // match V2/V3 generic lesion chips when possible
  for(const l of selectedOrganLesions){
    for(const generic of lesionDefs){
      if(l.includes(generic.split("／")[0]) || generic.includes(l.split("／")[0])) selectedLesions.add(generic);
    }
  }
  $$("#lesionChips .chip").forEach(x=>x.classList.toggle("active",selectedLesions.has(x.dataset.lesion)));
  switchTab("triage");
  currentStep=4;renderStep();
  $("#lesionText").scrollIntoView({behavior:"smooth",block:"center"});
};
renderOrganGrid();

renderDiseases();renderFavorites();renderCases();



/* ---------- V18 Google Sheets / Apps Script Multi-device Sync ---------- */
const SYNC_SETTINGS_KEY="pigCloudSyncSettings";
let syncSettings=safeJSONStorage(SYNC_SETTINGS_KEY,{endpoint:"",syncKey:"",token:"",auto:false});
let cloudMetaCache=null;

function normalizeEndpoint(v){
  return String(v||"").trim().replace(/\/+$/,"");
}
function syncSettingsValid(){
  return !!(normalizeEndpoint(syncSettings.endpoint)&&String(syncSettings.syncKey||"").trim()&&String(syncSettings.token||"").trim());
}
function syncStatusBox(id,text,kind=""){
  const el=$(id);if(!el)return;
  el.classList.remove("hidden","sync-state-ok","sync-state-warn","sync-state-bad");
  if(kind)el.classList.add(`sync-state-${kind}`);
  el.textContent=text;
}
function renderSyncPanel(){
  if(!$("#syncEndpoint"))return;
  $("#syncEndpoint").value=syncSettings.endpoint||"";
  $("#syncKey").value=syncSettings.syncKey||"";
  $("#syncToken").value=syncSettings.token||"";
  $("#syncAuto").checked=!!syncSettings.auto;
  renderSyncStatusSummary();
}
function renderSyncStatusSummary(){
  if(!$("#syncStatusSummary"))return;
  const local=localModifiedAt();
  const cloud=cloudMetaCache?.updated_at||"";
  const rows=[
    ["連線設定",syncSettingsValid()?"完整":"尚未完成"],
    ["本機最後變更",local?formatIsoLocal(local):"尚無紀錄"],
    ["雲端最後更新",cloud?formatIsoLocal(cloud):"尚未讀取"],
    ["上次成功上傳",formatIsoLocal(localStorage.getItem("pigSyncLastPush")||"")||"—"],
    ["上次成功下載",formatIsoLocal(localStorage.getItem("pigSyncLastPull")||"")||"—"]
  ];
  $("#syncStatusSummary").innerHTML=rows.map(([k,v])=>`<div class="dash-row"><span>${esc(k)}</span><span class="dash-value">${esc(v)}</span></div>`).join("");
}
function formatIsoLocal(v){
  if(!v)return "";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);
  return d.toLocaleString("zh-TW",{hour12:false});
}
function saveSyncSettingsFromUI(){
  syncSettings={
    endpoint:normalizeEndpoint($("#syncEndpoint").value),
    syncKey:$("#syncKey").value.trim(),
    token:$("#syncToken").value.trim(),
    auto:$("#syncAuto").checked
  };
  localStorage.setItem(SYNC_SETTINGS_KEY,JSON.stringify(syncSettings));
  renderSyncStatusSummary();
}
$("#saveSyncSettings").onclick=()=>{
  saveSyncSettingsFromUI();
  syncStatusBox("#syncConnectionStatus","同步設定已儲存在這台裝置。","ok");
};

async function syncRequest(action,extra={}){
  if(!syncSettingsValid())throw new Error("請先完成 Apps Script 網址、同步代號與同步密鑰設定。");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const body={action,sync_key:syncSettings.syncKey,token:syncSettings.token,app_version:APP_VERSION,...extra};
    const res=await fetch(syncSettings.endpoint,{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify(body),
      signal:controller.signal,
      redirect:"follow"
    });
    const text=await res.text();
    let obj;
    try{obj=JSON.parse(text);}catch(e){throw new Error("Apps Script 回傳不是 JSON。請確認使用的是最新 /exec 部署。");}
    if(!res.ok||obj.ok===false)throw new Error(obj.error||`HTTP ${res.status}`);
    return obj;
  }catch(err){
    if(err.name==="AbortError")throw new Error("連線逾時，請確認網路與 Apps Script 部署網址。");
    throw err;
  }finally{
    clearTimeout(timer);
  }
}
async function fetchCloudMeta(){
  const obj=await syncRequest("meta");
  cloudMetaCache=obj.exists?obj:null;
  renderSyncStatusSummary();
  return obj;
}
$("#testSyncConnection").onclick=async()=>{
  saveSyncSettingsFromUI();
  syncStatusBox("#syncConnectionStatus","正在測試連線…");
  try{
    const obj=await syncRequest("ping");
    syncStatusBox("#syncConnectionStatus",`連線正常｜伺服器 ${obj.server_time?formatIsoLocal(obj.server_time):"已回應"}`,"ok");
    await fetchCloudMeta();
  }catch(err){
    syncStatusBox("#syncConnectionStatus",`連線失敗：${err.message}`,"bad");
  }
};

async function pushCloudBackup(requireConfirm=false){
  saveSyncSettingsFromUI();
  if(requireConfirm&&!confirm("確定以這台裝置目前資料更新雲端備份？"))return false;
  syncStatusBox("#syncOperationStatus","正在上傳本機資料…");
  try{
    const payload=backupPayload();
    payload.sync_local_modified=localModifiedAt()||new Date().toISOString();
    const obj=await syncRequest("push",{payload});
    const now=obj.updated_at||new Date().toISOString();
    localStorage.setItem("pigSyncLastPush",now);
    localStorage.setItem("pigSyncLocalModified",now);
    cloudMetaCache={updated_at:now,app_version:obj.app_version||APP_VERSION,exists:true};
    renderSyncStatusSummary();
    syncStatusBox("#syncOperationStatus",`上傳完成｜${formatIsoLocal(now)}`,"ok");
    return true;
  }catch(err){
    syncStatusBox("#syncOperationStatus",`上傳失敗：${err.message}`,"bad");
    return false;
  }
}
async function pullCloudBackup(requireConfirm=true){
  saveSyncSettingsFromUI();
  syncStatusBox("#syncOperationStatus","正在讀取雲端資料…");
  try{
    const obj=await syncRequest("pull");
    if(!obj.exists||!obj.payload)throw new Error("雲端目前沒有可下載的備份。");
    const err=validateBackupPayload(obj.payload);
    if(err)throw new Error(`雲端備份格式檢查失敗：${err}`);
    if(requireConfirm&&!confirm(`雲端版本：${formatIsoLocal(obj.updated_at)}\n確定下載並覆蓋本機病例資料？\n\n系統會先自動下載一份目前本機快照。`)){
      syncStatusBox("#syncOperationStatus","已取消下載。","warn");return false;
    }
    // Safety snapshot before overwrite.
    const localSnapshot=backupPayload();
    downloadBlob(`同步前本機快照_${todayLocal()}_${APP_VERSION}.json`,JSON.stringify(localSnapshot,null,2),"application/json;charset=utf-8");

    BACKUP_KEYS.forEach(k=>{
      const v=obj.payload.data[k];
      if(v===null||v===undefined)localStorage.removeItem(k);
      else localStorage.setItem(k,JSON.stringify(v));
    });
    const stamp=obj.updated_at||new Date().toISOString();
    localStorage.setItem("pigSyncLastPull",stamp);
    localStorage.setItem("pigSyncLocalModified",stamp);
    syncStatusBox("#syncOperationStatus",`下載完成｜${formatIsoLocal(stamp)}。系統即將重新載入。`,"ok");
    setTimeout(()=>location.reload(),450);
    return true;
  }catch(err){
    syncStatusBox("#syncOperationStatus",`下載失敗：${err.message}`,"bad");
    return false;
  }
}
$("#pushCloudBackup").onclick=()=>pushCloudBackup(true);
$("#pullCloudBackup").onclick=()=>pullCloudBackup(true);

async function smartSync(){
  saveSyncSettingsFromUI();
  syncStatusBox("#syncOperationStatus","正在比較本機與雲端版本…");
  try{
    const meta=await fetchCloudMeta();
    if(!meta.exists){
      syncStatusBox("#syncOperationStatus","雲端尚無資料，將建立第一份備份。","warn");
      return await pushCloudBackup(false);
    }
    const local=localModifiedAt();
    const cloud=meta.updated_at||"";
    const lt=local?new Date(local).getTime():0, ct=cloud?new Date(cloud).getTime():0;
    if(!lt && ct)return await pullCloudBackup(true);
    if(lt>ct+1000){
      if(confirm(`本機資料較新。\n本機：${formatIsoLocal(local)}\n雲端：${formatIsoLocal(cloud)}\n\n要用本機更新雲端嗎？`))return await pushCloudBackup(false);
      syncStatusBox("#syncOperationStatus","已保留兩邊資料，未進行覆蓋。","warn");return false;
    }
    if(ct>lt+1000){
      return await pullCloudBackup(true);
    }
    syncStatusBox("#syncOperationStatus","本機與雲端版本時間一致，不需同步。","ok");
    return true;
  }catch(err){
    syncStatusBox("#syncOperationStatus",`同步失敗：${err.message}`,"bad");
    return false;
  }
}
$("#syncNowBtn").onclick=smartSync;

async function autoCheckCloud(){
  if(!syncSettings.auto||!syncSettingsValid()||!navigator.onLine)return;
  try{
    const meta=await fetchCloudMeta();
    const local=localModifiedAt();
    if(meta.exists&&meta.updated_at&&(!local||new Date(meta.updated_at)>new Date(local))){
      console.info("Cloud backup is newer:",meta.updated_at);
      // Do not overwrite automatically. Just surface status on sync page.
      localStorage.setItem("pigSyncCloudNewer","1");
    }else{
      localStorage.removeItem("pigSyncCloudNewer");
    }
  }catch(err){
    console.warn("Auto cloud check failed",err);
  }
}
setTimeout(autoCheckCloud,1200);
renderSyncPanel();

/* ---------- V17 Backup / Recovery / Runtime Hardening ---------- */
const BACKUP_KEYS=[
  "pigDiseaseFavs","pigDiseaseCases","pigActionChecklist","pigTrackedCases",
  "pigLabOrders","pigTreatmentPlans","pigDailyTaskChecks"
];
function backupPayload(){
  const data={};
  BACKUP_KEYS.forEach(k=>{
    const raw=localStorage.getItem(k);
    data[k]=raw===null?null:safeJSONStorage(k,null);
  });
  return {
    schema:"pig-disease-system-backup",
    schema_version:1,
    app_version:APP_VERSION,
    exported_at:new Date().toISOString(),
    data
  };
}
function validateBackupPayload(obj){
  if(!obj||typeof obj!=="object")return "備份不是有效 JSON 物件。";
  if(obj.schema!=="pig-disease-system-backup")return "不是本系統的完整備份格式。";
  if(obj.schema_version!==1)return `不支援的備份版本：${obj.schema_version}`;
  if(!obj.data||typeof obj.data!=="object")return "備份缺少 data 區段。";
  const arrayKeys=["pigDiseaseFavs","pigDiseaseCases","pigTrackedCases","pigLabOrders","pigTreatmentPlans"];
  const objectKeys=["pigActionChecklist","pigDailyTaskChecks"];
  for(const k of arrayKeys){
    const v=obj.data[k];
    if(v!==null&&v!==undefined&&!Array.isArray(v))return `${k} 格式錯誤，預期為陣列。`;
  }
  for(const k of objectKeys){
    const v=obj.data[k];
    if(v!==null&&v!==undefined&&(typeof v!=="object"||Array.isArray(v)))return `${k} 格式錯誤，預期為物件。`;
  }
  return "";
}
function renderBackupPanel(){
  if(!$("#backupDataSummary"))return;
  const rows=[
    ["收藏疾病",favorites.size+" 筆"],
    ["病例判斷紀錄",caseHistory.length+" 筆"],
    ["追蹤病例",trackedCases.length+" 件"],
    ["送檢紀錄",labOrders.length+" 件"],
    ["治療方案",treatmentPlans.length+" 件"],
    ["每日工作勾選",Object.keys(dailyTaskChecks||{}).length+" 筆"]
  ];
  $("#backupDataSummary").innerHTML=rows.map(([k,v])=>`<div class="dash-row"><span>${esc(k)}</span><span class="dash-value">${esc(v)}</span></div>`).join("");
  renderPwaStatus();
}
function renderPwaStatus(){
  if(!$("#pwaStatus"))return;
  const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone===true;
  const secure=location.protocol==="https:" || ["localhost","127.0.0.1"].includes(location.hostname);
  const sw="serviceWorker" in navigator;
  const online=navigator.onLine;
  const rows=[
    ["目前模式",standalone?"已安裝／獨立視窗":"瀏覽器模式"],
    ["安全來源",secure?"可使用 PWA":"需 HTTPS 或 localhost"],
    ["Service Worker",sw?"瀏覽器支援":"瀏覽器不支援"],
    ["網路狀態",online?"連線中":"離線"]
  ];
  $("#pwaStatus").innerHTML=rows.map(([k,v])=>`<div class="dash-row"><span>${esc(k)}</span><span class="dash-value">${esc(v)}</span></div>`).join("");
}
$("#exportFullBackup").onclick=()=>{
  const payload=backupPayload();
  downloadBlob(`豬病系統完整備份_${todayLocal()}_${APP_VERSION}.json`,JSON.stringify(payload,null,2),"application/json;charset=utf-8");
};
$("#restoreFullBackup").onclick=async()=>{
  const box=$("#restoreStatus");
  const file=$("#backupFileInput").files?.[0];
  box.classList.remove("hidden");
  if(!file){box.textContent="請先選擇備份 JSON 檔。";return;}
  try{
    const text=await file.text();
    const obj=JSON.parse(text);
    const err=validateBackupPayload(obj);
    if(err){box.textContent=`檢查失敗：${err}`;return;}
    if(!confirm("備份檢查通過。確定要用此備份覆蓋目前本機資料？")){box.textContent="已取消還原。";return;}
    BACKUP_KEYS.forEach(k=>{
      const v=obj.data[k];
      if(v===null||v===undefined)localStorage.removeItem(k);
      else localStorage.setItem(k,JSON.stringify(v));
    });
    box.textContent="還原完成，系統將重新載入。";
    setTimeout(()=>location.reload(),250);
  }catch(err){
    console.error(err);
    box.textContent="還原失敗：檔案不是有效 JSON，或內容無法讀取。";
  }
};
window.addEventListener("online",()=>{if($("#tab-backup")?.classList.contains("active"))renderPwaStatus();});
window.addEventListener("offline",()=>{if($("#tab-backup")?.classList.contains("active"))renderPwaStatus();});

function showRuntimeError(message){
  let el=document.querySelector(".system-error-banner");
  if(!el){
    el=document.createElement("div");el.className="system-error-banner";document.body.appendChild(el);
  }
  el.textContent=`系統偵測到執行錯誤：${message}。建議先匯出備份後重新整理頁面。`;
}
window.addEventListener("error",e=>{
  console.error("Runtime error",e.error||e.message);
  if(e.message)showRuntimeError(e.message);
});
window.addEventListener("unhandledrejection",e=>{
  console.error("Unhandled promise rejection",e.reason);
  showRuntimeError("背景操作未完成");
});

renderBackupPanel();

let deferredPrompt;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("#installBtn").classList.remove("hidden");});
$("#installBtn").onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();deferredPrompt=null;$("#installBtn").classList.add("hidden");};
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("sw.js?v=24",{updateViaCache:"none"}).then(reg=>{
    reg.update().catch(()=>{});
    if(reg.waiting) console.info("New service worker waiting");
  }).catch(err=>{
    console.warn("Service worker registration failed",err);
  });
}
