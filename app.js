/* ═══════════════════════════════════════════════════════════
   PERSONAL CONFIG — fill in these two values once, then deploy
   ═══════════════════════════════════════════════════════════ */
const OAUTH_CLIENT_ID = '821147263817-lrm26e45gsrl7lhbt26c8o2ia6g89h9q.apps.googleusercontent.com';
/* ═══════════════════════════════════════════════════════════ */

'use strict';
/* =================================================================
   STORE — everything lives in localStorage under one key.
   Each financial year carries its OWN frozen copy of tax rates:
   editing FY2027 never touches FY2026. That is the historical-
   accuracy rule, enforced structurally.
================================================================= */
const LS_KEY='ledger.au.v1';
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
let PRIVACY_MODE=false; // transient, not persisted — masks $ values for demos
function privacyToggle(){PRIVACY_MODE=!PRIVACY_MODE;const btn=document.getElementById('privacyBtn');if(btn)btn.textContent=PRIVACY_MODE?'🙈':'👁';render();}
const fmt$=n=>{if(PRIVACY_MODE)return (n<0?'-$':'$')+'••.••';return (n<0?'-$':'$')+Math.abs(+n||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});};
const fmt$0=n=>{if(PRIVACY_MODE)return (n<0?'-$':'$')+'•••';return (n<0?'-$':'$')+Math.abs(+n||0).toLocaleString('en-AU',{maximumFractionDigits:0});};
const pct=n=>(+n||0).toFixed(2)+'%';
const num=v=>{const n=parseFloat(String(v).replace(/[,$\s]/g,''));return isFinite(n)?n:0;};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayISO=()=>new Date().toISOString().slice(0,10);
const fmtDate=iso=>{if(!iso)return'';const[y,m,d]=iso.split('-');return `${d}/${m}/${y}`;};

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2400);}

/* ---------- Default rate snapshots (editable in Tax settings) ----------
   Seeded from published ATO figures; always verify before lodging. */
function ratesFY2025(){return{
  brackets:[{upTo:18200,rate:0},{upTo:45000,rate:16},{upTo:135000,rate:30},{upTo:190000,rate:37},{upTo:null,rate:45}],
  lito:{max:700,t1:37500,taper1:5,t2:45000,taper2:1.5},
  medicare:{rate:2,lowerThreshold:27222,shadeRate:10},
  mls:[{min:0,rate:0},{min:97001,rate:1},{min:113001,rate:1.25},{min:151001,rate:1.5}],
  // Family MLS thresholds — roughly double the singles tiers, plus an
  // extra amount per dependent child after the first. Verify with the ATO
  // before relying on these for lodgement.
  mlsFamily:{tiers:[{min:0,rate:0},{min:194001,rate:1},{min:226001,rate:1.25},{min:302001,rate:1.5}],dependentIncrement:1500},
  wfh:{ratePerHour:0.70,hoursPerDay:7.6},
  deviceImmediateCap:300, centsPerKm:0.88,
  // Superannuation contribution caps — verify with the ATO before relying
  // on these; they're indexed periodically, not every year.
  superCapConcessional:30000, superCapNonConcessional:120000,
  // Superannuation Guarantee rate — ATO-mandated minimum employer contributions.
  // Verify before use: it increases incrementally each year.
  superSGRate:11.5
};}
function ratesFY2026(){const r=ratesFY2025();
  r.medicare.lowerThreshold=27222; /* update when ATO indexes */
  r.mls=[{min:0,rate:0},{min:101001,rate:1},{min:118001,rate:1.25},{min:158001,rate:1.5}];
  r.mlsFamily={tiers:[{min:0,rate:0},{min:202001,rate:1},{min:236001,rate:1.25},{min:316001,rate:1.5}],dependentIncrement:1500};
  r.centsPerKm=0.92;
  r.superSGRate=12; // SG rate increases to 12% from 1 July 2025
  return r;
}
const ATO_DEDUCTION_TYPES=['Working from home','Tax prep / managing tax affairs','Self-education','Tools & equipment','Travel & transport','Car expenses','Clothing & laundry','Phone, data & internet','Subscriptions, software & union fees','Donations & gifts','Income protection insurance','Personal super contributions','Interest & dividend deductions','Other work-related expenses'];

function newBucket(){return{
  incomes:[], dividends:[], funds:[], sales:[], fundPayments:[],
  wfh:{days:{},hoursPerDay:null},
  property:{expenses:[]},
  other:[], devices:[],
  expenses:[],
  preTaxDeds:[], // salary-sacrifice: additional super, novated lease, etc — reduce taxable income, not "deductions" claimed at tax time
  superContributions:[], // employer SG / personal deductible / non-concessional / spouse — see Superannuation page
  summaryOpts:{medicare:true,mls:false,hasCover:true},
  myTax:{status:'unfiled',filedDate:'',receiptId:'',receiptName:''}, // lodgement tracking — see myTax mapping page
  fbt:{amount:0,receiptId:'',receiptName:''} // IT1 — reportable fringe benefits, from your employer's FBT statement
};}
function newFY(startYear,rates){
  const people={};(DB?DB.people:[{id:'p1'}]).forEach(pp=>people[pp.id]=newBucket());
  return{
  startYear, label:`FY${String(startYear).slice(2)}–${String(startYear+1).slice(2)}`,
  displayName:'', rangeStart:null, rangeEnd:null,
  locked:false, rates, extraHolidays:[], removedHolidays:[], webHolidays:null,
  budgets:[],
  mlsFamily:{enabled:false,dependents:1}, // household-wide: combined MLS thresholds for couples/families
  people
};}

let DB=null;
const PERSON_COLS=['#2E7D5B','#2563B8','#B4452F','#7A6FB3','#B8860B','#4FA3A5'];
function defaultDB(){
  DB={people:[{id:'p1',name:'Me',color:PERSON_COLS[0]}]};
  const fy25=newFY(2024,ratesFY2025()), fy26=newFY(2025,ratesFY2026());
  return{theme:'light',currentFY:'2025',currentPid:'p1',
    people:[{id:'p1',name:'Me',color:PERSON_COLS[0]}],
    platforms:['Stake','Superhero','CommSec','SelfWealth'],
    assets:[], nw:{items:[],entries:[]},
    gdrive:{clientId:'',token:'',tokenExpiry:0},
    rcptMeta:{},
    _syncTs:0, _syncDevice:'', _lastSnapshotDate:'', _lastPriceFetchDate:'',
    years:{'2024':fy25,'2025':fy26}};
}
/* Fills in any fields/shapes a saved or imported DB might be missing —
   defensive normalization, not migration. Every check here is additive
   and idempotent ("ensure this exists") so it's safe to run on every
   load regardless of what produced the data (manual edit, partial
   export, a field added to the app after this DB was last saved). */
function ensureDbShape(db){
  db.platforms=db.platforms||['Stake','Superhero','CommSec','SelfWealth'];
  db.assets=db.assets||[];
  db.nw=db.nw||{items:[],entries:[]};
  db.gdrive=db.gdrive||{clientId:'',token:'',tokenExpiry:0};
  if(db.gdrive.folderId!==undefined)delete db.gdrive.folderId;
  db.rcptMeta=db.rcptMeta||{};
  if(db._lastSnapshotDate===undefined)db._lastSnapshotDate='';
  if(db._lastPriceFetchDate===undefined)db._lastPriceFetchDate='';
  // currentFY / currentPid may be absent in old exported data — default to
  // the most recent FY and first person so the app doesn't crash on load.
  if(!db.currentFY||!db.years[db.currentFY]){
    const keys=Object.keys(db.years||{}).map(Number).filter(n=>!isNaN(n));
    db.currentFY=keys.length?String(Math.max(...keys)):'2025';
  }
  if(!db.currentPid||!(db.people||[]).find(p=>p.id===db.currentPid)){
    db.currentPid=(db.people&&db.people[0]&&db.people[0].id)||'p1';
  }
  if(!db.theme)db.theme='light';
  Object.values(db.years).forEach(y=>{
    Object.values(y.people||{}).forEach(b=>{
      b.fundPayments=b.fundPayments||[];
      if(b.summaryOpts)delete b.summaryOpts.help;
      if(!b.preTaxDeds)b.preTaxDeds=[];
      if(!b.superContributions)b.superContributions=[];
      // Borrowing-cost-schedule rows were briefly written as literal
      // property expenses (tagged costId) — now computed on the fly
      // instead, like depreciation, so they never count twice and never
      // show up as a cash "expense". Strip any leftover tagged rows.
      if(b.property&&b.property.expenses&&b.property.expenses.some(e=>e.costId))
        b.property.expenses=b.property.expenses.filter(e=>!e.costId);
      // Property expenses manually tagged "Borrowing costs" via the
      // regular expense form (a category that used to exist there,
      // inviting exactly this mistake) are a deduction spread over 5
      // years per ATO rules, never a cash expense — convert any found
      // into a proper a.costs entry on the matching asset and remove the
      // literal expense row, so existing mis-categorised data is fixed
      // automatically rather than just preventing new instances.
      if(b.property&&b.property.expenses){
        const borrowingRows=b.property.expenses.filter(e=>e.category==='Borrowing costs');
        borrowingRows.forEach(e=>{
          const a=e.assetId?(db.assets||[]).find(x=>x.id===e.assetId):null;
          if(a){
            a.costs=a.costs||[];
            a.costs.push({id:uid(),name:e.item||'Borrowing cost',date:e.date,amount:num(e.amount),spreadYears:5});
          }
        });
        if(borrowingRows.length)b.property.expenses=b.property.expenses.filter(e=>e.category!=='Borrowing costs');
      }
    });
    if(y.rates){
      delete y.rates.help;
      if(y.rates.superCapConcessional===undefined)y.rates.superCapConcessional=30000;
      if(y.rates.superCapNonConcessional===undefined)y.rates.superCapNonConcessional=120000;
      if(y.rates.superSGRate===undefined)y.rates.superSGRate=11.5;
    }
    (y.budgets||[]).forEach(bd=>Object.values(bd.opts||{}).forEach(o=>delete o.help));
    if(!y.mlsFamily)y.mlsFamily={enabled:false,dependents:1};
    if(y.displayName===undefined)y.displayName='';
    if(y.rangeStart===undefined)y.rangeStart=null;
    if(y.rangeEnd===undefined)y.rangeEnd=null;
    // y.label was originally set once at FY creation time from startYear and
    // never updated — if the user later edits the start date via "Edit
    // financial year", the parenthetical auto-label shown in the FY list
    // went stale (e.g. showing "FY26–27" for a year whose dates were
    // changed to FY23–24). Recompute it from the current dates every load.
    y.label=fyLabelFromStart(y.rangeStart||y.startYear+'-07-01');
  });
  // Asset creation previously omitted `pid`, silently attributing every
  // asset to people[0] via a fallback in assetsForPerson(). Make that
  // explicit now so per-person filtering is consistent and future edits
  // don't accidentally reassign ownership.
  (db.assets||[]).forEach(a=>{if(!a.pid)a.pid=db.people[0]?.id;});
  // Property expenses previously had no distinction between the full cash
  // amount and the tax-deductible portion (e.g. a mortgage repayment is
  // mostly principal, but only the interest is deductible). Every existing
  // entry was implicitly treated as 100% deductible — preserve that.
  Object.values(db.years).forEach(y=>{
    Object.values(y.people||{}).forEach(b=>{
      (b.property?.expenses||[]).forEach(e=>{if(e.deductibleAmount===undefined)e.deductibleAmount=num(e.amount);});
    });
  });
  return db;
}
function load(){try{const raw=localStorage.getItem(LS_KEY);DB=raw?ensureDbShape(JSON.parse(raw)):defaultDB();}catch(e){DB=defaultDB();}}
let _suppressSync=false; // set true while applying data pulled FROM Drive, to avoid an immediate redundant push back
function save(){
  try{localStorage.setItem(LS_KEY,JSON.stringify(DB));}catch(e){toast('Could not save: '+e.message);}
  if(!_suppressSync&&typeof scheduleDriveSync==='function')scheduleDriveSync();
}
function isAllFY(){return DB.currentFY==='all';}
/* Falls back to the latest created year when "All time" is selected, so
   any code calling FY() unconditionally still gets a usable year object
   instead of crashing. Pages that want real all-time behaviour should
   check isAllFY() directly rather than relying on this fallback. */
function FY(){
  if(DB.currentFY!=='all'&&DB.years[DB.currentFY])return DB.years[DB.currentFY];
  const ys=Object.values(DB.years);
  if(!ys.length)return null;
  return ys.sort((a,b)=>fyOrderYear(b)-fyOrderYear(a))[0];
}
function isAll(){return DB.currentPid==='all';}
function person(pid){return DB.people.find(p=>p.id===pid)||{id:pid,name:'?',color:'#888'};}
function bucket(y,pid){y.people=y.people||{};return y.people[pid]||(y.people[pid]=newBucket());}
function PD(pid){return bucket(FY(),pid||(isAll()?DB.people[0].id:DB.currentPid));}
function pdot(p,sz){return `<span class="pd" style="background:${p.color};${sz?'width:'+sz+'px;height:'+sz+'px;':''}"></span>`;}
function fyLabel(y){return y?y.label:'';}
function fyDisplay(y){
  if(!y)return'';
  if(y.displayName)return y.displayName;
  // If a custom start date is set, derive the label from it rather than the original startYear
  if(y.rangeStart){
    const yr=parseInt(y.rangeStart.slice(0,4),10);
    if(!isNaN(yr))return`FY${String(yr).slice(2)}–${String(yr+1).slice(2)}`;
  }
  return y.label;
}
function fyLabelFromStart(startISO){
  if(!startISO)return '';
  const yr=parseInt(startISO.slice(0,4),10);
  return isNaN(yr)?'':(`FY${String(yr).slice(2)}–${String(yr+1).slice(2)}`);
}
function fyRange(y){return{start:y.rangeStart||`${y.startYear}-07-01`,end:y.rangeEnd||`${y.startYear+1}-06-30`};}
/* Calendar {yr, mo (0-indexed)} for the idx-th month of FY y (idx 0..11),
   derived from the FY's actual start date (fyRange) — NOT y.startYear,
   which is just the storage slot and can differ from the FY's real dates
   once the user customises start/end via Settings → Edit financial year. */
function fyMonthYM(y,idx){
  const {start}=fyRange(y);
  const startYr=parseInt(start.slice(0,4),10),startMo=parseInt(start.slice(5,7),10)-1;
  const mo=(startMo+idx)%12,yr=startYr+Math.floor((startMo+idx)/12);
  return{yr,mo};
}
/* Year to sort FYs by for display (newest-first lists, FY dropdown).
   y.startYear is just the storage slot — once a FY's dates are customised
   via Settings → Edit financial year, its EFFECTIVE year (and therefore
   its position in any "newest first" list) should follow fyRange(y).start,
   not the slot it happens to be stored under. */
function fyOrderYear(y){return parseInt(fyRange(y).start.slice(0,4));}
/* Finds the FY object whose real (date-derived) order-year matches the
   given integer — robust to a year's dict key/startYear drifting from
   its actual dates after a custom rename. Prefer this over DB.years[k]
   whenever matching a raw "FY starting YYYY" number against real years. */
function yearByOrderYear(yr){return Object.values(DB.years).find(y=>fyOrderYear(y)===yr)||null;}
function fyIsPast(y){const end=y.rangeEnd||`${y.startYear+1}-06-30`;return new Date()>new Date(end+'T23:59:59');}

/* ---------- Victorian public holidays ---------- */
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return new Date(Date.UTC(y,mo-1,da));}
const iso=d=>d.toISOString().slice(0,10);
const addD=(d,n)=>{const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x;};
function nthMonday(y,month,n){const d=new Date(Date.UTC(y,month,1));const off=(8-d.getUTCDay())%7;d.setUTCDate(1+off+(n-1)*7);return d;}
function firstTuesday(y,month){const d=new Date(Date.UTC(y,month,1));const off=(9-d.getUTCDay())%7;d.setUTCDate(1+off);return d;}
const GF_EVE={2023:'2023-09-29',2024:'2024-09-27',2025:'2025-09-26',2026:'2026-09-25',2027:'2027-09-24'}; // AFL GF eve; future years estimated — editable in settings
function vicHolidaysCalYear(y){
  const H=[];const push=(d,n)=>H.push({date:typeof d==='string'?d:iso(d),name:n});
  const sub=(d,n)=>{const dt=new Date(d+'T00:00:00Z');const dow=dt.getUTCDay();push(d,n);if(dow===6)push(iso(addD(dt,2)),n+' (substitute)');if(dow===0)push(iso(addD(dt,1)),n+' (substitute)');};
  sub(`${y}-01-01`,"New Year's Day"); sub(`${y}-01-26`,'Australia Day');
  push(nthMonday(y,2,2),'Labour Day');
  const es=easter(y);push(addD(es,-2),'Good Friday');push(addD(es,-1),'Saturday before Easter');push(es,'Easter Sunday');push(addD(es,1),'Easter Monday');
  push(`${y}-04-25`,'Anzac Day');
  push(nthMonday(y,5,2),"King's Birthday");
  const gf=GF_EVE[y]||iso((()=>{const d=new Date(Date.UTC(y,8,30));while(d.getUTCDay()!==5)d.setUTCDate(d.getUTCDate()-1);return d;})());
  push(gf,'Friday before AFL Grand Final (est.)');
  push(firstTuesday(y,10),'Melbourne Cup');
  sub(`${y}-12-25`,'Christmas Day'); sub(`${y}-12-26`,'Boxing Day');
  return H;
}
function fyHolidays(y){
  const {start,end}=fyRange(y);
  let H;
  if(y.webHolidays&&y.webHolidays.list&&y.webHolidays.list.length){
    H=y.webHolidays.list.filter(h=>h.date>=start&&h.date<=end);
  }else{
    // Built-in calendar fallback (no online data fetched yet) — derive the
    // calendar years to generate from the FY's actual start/end dates, not
    // y.startYear, which is just the storage slot and can disagree with the
    // real dates once customised via Settings → Edit financial year.
    const calYearStart=parseInt(start.slice(0,4),10),calYearEnd=parseInt(end.slice(0,4),10);
    H=[];
    for(let yr=calYearStart;yr<=calYearEnd;yr++)H=H.concat(vicHolidaysCalYear(yr));
    H=H.filter(h=>h.date>=start&&h.date<=end);
  }
  H=H.filter(h=>!(y.removedHolidays||[]).includes(h.date));
  (y.extraHolidays||[]).forEach(h=>H.push(h));
  const seen=new Set();
  return H.filter(h=>seen.has(h.date)?false:(seen.add(h.date),true)).sort((a,b)=>a.date<b.date?-1:1);
}

/* ---------- TAX ENGINE — always pass a specific FY's rates ---------- */
function incomeTax(taxable,R){let tax=0,prev=0;
  for(const b of R.brackets){const cap=b.upTo==null?Infinity:b.upTo;if(taxable>prev)tax+=(Math.min(taxable,cap)-prev)*(b.rate/100);prev=cap;if(taxable<=cap)break;}
  return Math.max(0,tax);}
function litoOffset(taxable,R){const L=R.lito;if(!L)return 0;
  if(taxable<=L.t1)return L.max;
  if(taxable<=L.t2)return Math.max(0,L.max-(taxable-L.t1)*(L.taper1/100));
  const atT2=L.max-(L.t2-L.t1)*(L.taper1/100);
  return Math.max(0,atT2-(taxable-L.t2)*(L.taper2/100));}
function medicareLevy(taxable,R){const M=R.medicare;if(!M||!M.rate)return 0;
  if(taxable<=M.lowerThreshold)return 0;
  return Math.min(taxable*(M.rate/100),(taxable-M.lowerThreshold)*((M.shadeRate||10)/100));}
function mlsSurcharge(income,R,hasCover){if(hasCover)return 0;let rate=0;
  for(const t of R.mls)if(income>=t.min)rate=t.rate;return income*(rate/100);}
function fullTax(taxable,R,opt){opt=opt||{};
  const base=incomeTax(taxable,R);
  const lito=Math.min(litoOffset(taxable,R),base);
  const med=opt.medicare===false?0:medicareLevy(taxable,R);
  let mls=0;
  if(opt.mls&&!opt.hasCover){
    mls=opt.mlsRate!=null?taxable*(opt.mlsRate/100):mlsSurcharge(taxable,R,opt.hasCover);
  }
  return{base,lito,medicare:med,mls,total:Math.max(0,base-lito)+med+mls};}


/* ---------- Public holiday auto-fetch ----------
   Tries the Victorian Government Important Dates dataset (data.vic.gov.au)
   first, then the keyless Nager.Date API filtered to AU-VIC. The computed
   calendar above stays as the offline fallback. Locked FYs are never touched. */
const DATAVIC_RESOURCE='caaa47de-8626-46a6-aa28-3d948c15c5d9';
function holNormDate(v){
  if(v==null)return null;v=String(v).trim();
  let m=v.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  m=v.match(/^(\d{4})(\d{2})(\d{2})$/);if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const d=new Date(v);return isNaN(d)?null:d.toISOString().slice(0,10);
}
/* Normalises a "type"/"category" field value for comparison, e.g.
   "Public Holiday", "PUBLIC_HOLIDAY", "public-holiday" all become "PUBLICHOLIDAY".
   The Vic Gov Important Dates dataset (and its v2 API) use several date
   types — PUBLIC_HOLIDAY, SCHOOL_TERM, SCHOOL_HOLIDAY, DAYLIGHT_SAVING,
   PARLIAMENT_SITTING, MULTI_FAITH — and a loose /holiday/i match incorrectly
   pulls in SCHOOL_HOLIDAY / SCHOOL_TERM records too. We need an exact match
   on PUBLIC_HOLIDAY only. */
function normHolType(s){return String(s||'').toUpperCase().replace(/[^A-Z]/g,'');}
/* CKAN's datastore_search API has no server-side "start_date"/"end_date"
   params (unlike the v2 API), and the underlying date column's raw format
   isn't consistent enough to trust a SQL range comparison via
   datastore_search_sql. So instead we fetch the full dataset (limit=2000
   comfortably covers it) and apply the FY's exact start/end dates — plus
   the PUBLIC_HOLIDAY type filter — as soon as each record is normalised,
   right here, so callers always get pre-filtered results. */
async function fetchHolidaysDataVic(start,end){
  const url=`https://discover.data.vic.gov.au/api/3/action/datastore_search?resource_id=${DATAVIC_RESOURCE}&limit=2000`;
  const js=await(await fetch(url)).json();
  const recs=(js.result&&js.result.records)||[];
  const out=[];
  recs.forEach(r=>{
    const keys=Object.keys(r);
    const typeK=keys.find(k=>/type|category/i.test(k));
    const dateK=keys.find(k=>/date/i.test(k)&&k!==typeK);
    const nameK=keys.find(k=>/name|title|holiday|description/i.test(k)&&!/date/i.test(k));
    if(!dateK)return;
    // Only keep records explicitly typed as PUBLIC_HOLIDAY — excludes
    // SCHOOL_HOLIDAY, SCHOOL_TERM and other date types that also contain
    // the substring "holiday".
    if(typeK&&normHolType(r[typeK])!=='PUBLICHOLIDAY')return;
    const date=holNormDate(r[dateK]);
    if(!date)return;
    // Restrict to the FY's exact start/end dates (inclusive), if provided.
    if(start&&date<start)return;
    if(end&&date>end)return;
    out.push({date,name:nameK?String(r[nameK]):'Public holiday'});
  });
  return out;
}
async function fetchHolidaysNager(calYear){
  const res=await fetch(`https://date.nager.at/api/v3/PublicHolidays/${calYear}/AU`);
  if(!res.ok)throw new Error('HTTP '+res.status);
  const js=await res.json();
  return js.filter(h=>!h.counties||h.counties.includes('AU-VIC'))
    .map(h=>({date:h.date,name:h.localName||h.name}));
}
async function fetchHolidaysForFY(y){
  const {start,end}=fyRange(y);
  // Each "source" published the FULL Victorian public-holiday calendar in
  // its own right — but any one of them may only have partial/incomplete
  // coverage for a given FY (e.g. a government dataset that hasn't yet been
  // updated for next year, or only covers one calendar year of a
  // July–June FY). Rather than picking ONE source and "topping up" gaps
  // (which previously broke when a source returned even a single date in
  // each half of the FY, masking a much larger gap), we now query EVERY
  // available source and take the UNION of all dates returned, deduplicated.
  // This guarantees completeness as long as at least one source has each
  // holiday, while still reporting which sources actually contributed.
  let list=[];
  const sources=[];
  const addAll=(arr,name)=>{
    let added=0;
    arr.forEach(h=>{if(!list.some(x=>x.date===h.date)){list.push(h);added++;}});
    if(added)sources.push(name);
  };
  // 1. CKAN discovery dataset (no key needed) — fetched in full then
  //    filtered client-side to this FY's range and to PUBLIC_HOLIDAY type.
  try{addAll(await fetchHolidaysDataVic(start,end),'data.vic.gov.au');}catch(e){}
  // Calendar years this FY spans — derived from its actual start/end dates,
  // not y.startYear, which is just the storage slot and can disagree with
  // the real dates once customised via Settings → Edit financial year.
  const calYearStart=parseInt(start.slice(0,4),10),calYearEnd=parseInt(end.slice(0,4),10);
  // 2. Nager.at — covers the FY by querying every calendar year it spans.
  try{
    let nagerAll=[];
    for(let yr=calYearStart;yr<=calYearEnd;yr++)nagerAll=nagerAll.concat(await fetchHolidaysNager(yr).catch(()=>[]));
    addAll(nagerAll.filter(h=>h.date>=start&&h.date<=end),'date.nager.at');
  }catch(e){}
  // 3. Built-in calendar — always available as a final safety net.
  let builtIn=[];
  for(let yr=calYearStart;yr<=calYearEnd;yr++)builtIn=builtIn.concat(vicHolidaysCalYear(yr));
  addAll(builtIn.filter(h=>h.date>=start&&h.date<=end),'built-in calendar');
  if(!list.length)throw new Error('no holidays returned');
  list=list.sort((a,b)=>a.date<b.date?-1:1);
  return{source:sources.join(' + ')||'built-in calendar',fetchedAt:todayISO(),list};
}
let HOLIDAY_REFRESHING=false; // true while a holiday fetch is in flight — lets the WFH tracker / Settings show a loading placeholder over the public-holiday list
async function refreshHolidays(y,opts){
  opts=opts||{};
  if(y.locked){if(!opts.silent)toast(y.label+' is locked \u2014 holidays frozen');return false;}
  HOLIDAY_REFRESHING=true;
  if(currentPage==='wfh'||currentPage==='settings')render();
  try{
    const wh=await fetchHolidaysForFY(y);
    const before=JSON.stringify((y.webHolidays||{}).list||null);
    y.webHolidays=wh;save();
    const changed=before!==JSON.stringify(wh.list);
    if(!opts.silent||changed)toast(`Public holidays ${changed?'updated':'checked'} from ${wh.source}`);
    HOLIDAY_REFRESHING=false;
    if((changed||!opts.silent)&&(currentPage==='wfh'||currentPage==='settings'))render();
    else if(currentPage==='wfh'||currentPage==='settings')render(); // clear the loading placeholder even if nothing changed
    return true;
  }catch(e){
    HOLIDAY_REFRESHING=false;
    if(!opts.silent)toast('Couldn\u2019t reach a holiday service \u2014 using the built-in calendar');
    if(currentPage==='wfh'||currentPage==='settings')render();
    return false;
  }
}
function autoRefreshHolidays(){
  const y=FY();
  if(!y||y.locked)return;
  const last=y.webHolidays&&y.webHolidays.fetchedAt;
  const stale=!last||(Date.now()-new Date(last).getTime())>30*864e5;
  if(stale)refreshHolidays(y,{silent:true});
}


/* ---------- Live ASX prices (best effort — browser CORS permitting) ---------- */
const PRICE_CACHE={};
async function fetchAsxPrice(code){
  code=String(code||'').trim().toUpperCase();
  if(!code)return null;
  const hit=PRICE_CACHE[code];
  if(hit&&Date.now()-hit.at<5*60*1000)return hit;
  const store=(p,src)=>{const out={code,price:p,source:src,at:Date.now()};PRICE_CACHE[code]=out;return out;};
  const yahooChart=`https://query1.finance.yahoo.com/v8/finance/chart/${code}.AX?range=1d&interval=1d`;
  const yahooQuote=`https://query1.finance.yahoo.com/v7/finance/quote?formatted=false&symbols=${code}.AX`;
  const parseChart=j=>num(j.chart?.result?.[0]?.meta?.regularMarketPrice);
  const parseQuote=j=>num(j.quoteResponse?.result?.[0]?.regularMarketPrice);
  // 1. Yahoo v7 quote — direct
  try{const r=await fetch(yahooQuote);if(r.ok){const j=await r.json();const p=parseQuote(j);if(p)return store(p,'Yahoo Finance');}}catch(e){}
  // 2. Yahoo v8 chart — direct
  try{const r=await fetch(yahooChart);if(r.ok){const j=await r.json();const p=parseChart(j);if(p)return store(p,'Yahoo Finance');}}catch(e){}
  // 3. ASX official REST
  try{const r=await fetch(`https://www.asx.com.au/asx/1/share/${code.toLowerCase()}/prices?interval=daily&count=1`);
    if(r.ok){const j=await r.json();const p=num(j.data?.[0]?.close_price);if(p)return store(p,'ASX');}}catch(e){}
  // 4. Stooq CSV (.au suffix for ASX)
  try{const r=await fetch(`https://stooq.com/q/l/?s=${code.toLowerCase()}.au&f=sd2t2ohlcvn&e=csv`);
    if(r.ok){const t=await r.text();const row=t.split('\n')[1]?.split(',');const p=num(row?.[6]);if(p&&p!==0)return store(p,'Stooq');}}catch(e){}
  // 5. Yahoo quote via corsproxy.io (works from file://)
  try{const r=await fetch('https://corsproxy.io/?'+encodeURIComponent(yahooQuote));
    if(r.ok){const j=await r.json();const p=parseQuote(j);if(p)return store(p,'Yahoo Finance');}}catch(e){}
  // 6. Yahoo chart via corsproxy.io
  try{const r=await fetch('https://corsproxy.io/?'+encodeURIComponent(yahooChart));
    if(r.ok){const j=await r.json();const p=parseChart(j);if(p)return store(p,'Yahoo Finance');}}catch(e){}
  // 7. Stooq via allorigins.win (CSV)
  try{const stooqUrl=`https://stooq.com/q/l/?s=${code.toLowerCase()}.au&f=sd2t2ohlcvn&e=csv`;
    const r=await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(stooqUrl));
    if(r.ok){const w=await r.json();const row=w.contents?.split('\n')[1]?.split(',');const p=num(row?.[6]);if(p&&p!==0)return store(p,'Stooq');}}catch(e){}
  // 8. Yahoo chart via allorigins.win
  try{const r=await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(yahooChart));
    if(r.ok){const w=await r.json();const j=JSON.parse(w.contents||'{}');const p=parseChart(j);if(p)return store(p,'Yahoo Finance');}}catch(e){}
  return null;
}


/* ---------- SVG chart helpers ---------- */
function chartFmt(n){
  if(PRIVACY_MODE)return'•••';
  const a=Math.abs(n);
  if(a>=1e6)return (n/1e6).toFixed(1)+'M';
  if(a>=1e3)return (n/1e3).toFixed(a>=1e4?0:1)+'k';
  return String(Math.round(n));
}
function barChartSVG(data,opts){ /* data:[{label,value,value2?}] */
  opts=opts||{};
  if(!data||!data.length)return '<div class="muted">No data yet.</div>';
  const W=620,H=200,padL=8,padB=26,padT=14;
  const color1=opts.color||'var(--euc)';
  const max=Math.max(1,...data.map(d=>num(d.value)+num(d.value2)));
  const bw=(W-padL*2)/data.length;
  const manyBars=data.length>7;
  let bars='';
  data.forEach((d,i)=>{
    const v1=num(d.value),v2=num(d.value2);
    const h1=(H-padB-padT)*v1/max, h2=(H-padB-padT)*v2/max;
    const x=padL+i*bw+bw*0.14, w=bw*0.72;
    // Alternating background band behind each bar slot, for easier column tracking without hovering
    if(i%2===1)bars+=`<rect x="${padL+i*bw}" y="${padT}" width="${bw}" height="${H-padT-padB}" fill="var(--line2)" opacity=".22"/>`;
    if(v2)bars+=`<rect x="${x}" y="${H-padB-h1-h2}" width="${w}" height="${h2}" rx="2" fill="var(--gold)" opacity=".85"><title>${esc(d.label)} — ${esc(opts.label2||'')}: ${fmt$(v2)}</title></rect>`;
    bars+=`<rect x="${x}" y="${H-padB-h1}" width="${w}" height="${Math.max(h1,v1>0?1.5:0)}" rx="2" fill="${color1}" opacity=".92"><title>${esc(d.label)}: ${fmt$(v1)}</title></rect>`;
    if(v1+v2>0)bars+=`<text class="vlab" x="${x+w/2}" y="${H-padB-h1-h2-4}" text-anchor="middle">${chartFmt(v1+v2)}</text>`;
    bars+=manyBars
      ?`<text class="axis" x="${x+w/2}" y="${H-padB+13}" text-anchor="end" transform="rotate(-40 ${x+w/2} ${H-padB+13})">${esc(d.label)}</text>`
      :`<text class="axis" x="${x+w/2}" y="${H-padB+15}" text-anchor="middle">${esc(d.label)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria||'Bar chart')}">
    <line x1="${padL}" y1="${H-padB}" x2="${W-padL}" y2="${H-padB}" stroke="var(--line2)"/>
    ${bars}</svg></div>`;
}
function lineChartSVG(pts,opts){ /* pts:[{label,value}] */
  opts=opts||{};
  const vfmt=opts.valueFmt||fmt$; // tooltip formatter — defaults to $ for backward compatibility
  const cfmt=opts.chartFmt||chartFmt; // axis value-label formatter
  const W=620,H=210,padL=10,padR=10,padB=28,padT=16;
  if(!pts.length)return '<div class="muted">No data yet.</div>';
  const vals=pts.map(p=>num(p.value));
  let lo=Math.min(...vals),hi=Math.max(...vals);
  if(lo===hi){lo-=1;hi+=1;}
  const span=hi-lo;lo-=span*0.08;hi+=span*0.08;
  const X=i=>pts.length===1?W/2:padL+(W-padL-padR)*i/(pts.length-1);
  const Y=v=>padT+(H-padB-padT)*(1-(v-lo)/(hi-lo));
  const path=pts.map((p,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(num(p.value)).toFixed(1)}`).join(' ');
  const area=`${path} L${X(pts.length-1).toFixed(1)},${H-padB} L${X(0).toFixed(1)},${H-padB} Z`;
  // Show as many axis labels as will reasonably fit unrotated; once there
  // are more points than that, rotate the labels so more can be shown
  // without overlapping (better differentiation than skipping months).
  const manyPts=pts.length>9;
  const axStep=Math.max(1,Math.ceil(pts.length/(manyPts?20:10)));
  const step=pts.length>18?Math.ceil(pts.length/9):pts.length>12?2:1;
  const dots=pts.map((p,i)=>`<circle cx="${X(i).toFixed(1)}" cy="${Y(num(p.value)).toFixed(1)}" r="3.5" fill="var(--euc)"><title>${esc(p.label)}: ${vfmt(p.value)}</title></circle>`).join('');
  const valLbls=pts.map((p,i)=>{if(i%step!==0&&i!==pts.length-1)return'';const cx=X(i).toFixed(1),cy=(Y(num(p.value))-10).toFixed(1);return`<text class="vlab" x="${cx}" y="${cy}" text-anchor="middle">${cfmt(p.value)}</text>`;}).join('');
  // Light vertical gridlines at each labeled tick, for easier left-to-right tracking
  const grid=pts.map((p,i)=>i%axStep?'':`<line x1="${X(i).toFixed(1)}" y1="${padT}" x2="${X(i).toFixed(1)}" y2="${H-padB}" stroke="var(--line2)" opacity=".35"/>`).join('');
  const labels=pts.map((p,i)=>{
    if(i%axStep)return'';
    const cx=X(i).toFixed(1);
    return manyPts
      ?`<text class="axis" x="${cx}" y="${H-padB+13}" text-anchor="end" transform="rotate(-40 ${cx} ${H-padB+13})">${esc(p.label)}</text>`
      :`<text class="axis" x="${cx}" y="${H-padB+15}" text-anchor="middle">${esc(p.label)}</text>`;
  }).join('');
  const zero=(lo<0&&hi>0)?`<line x1="${padL}" y1="${Y(0).toFixed(1)}" x2="${W-padR}" y2="${Y(0).toFixed(1)}" stroke="var(--line2)" stroke-dasharray="3 3"/>`:'';
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria||'Line chart')}">
    ${grid}${zero}<path d="${area}" fill="var(--euc)" opacity=".10"/><path d="${path}" fill="none" stroke="var(--euc)" stroke-width="2.2" stroke-linejoin="round"/>${dots}${valLbls}${labels}</svg></div>`;
}
/* Donut chart with a legend showing each slice's label, $ amount, and
   percentage. data:[{label,value,color}]. Slices with value<=0 are
   dropped (a pie can't represent a negative share). */
function pieChartSVG(data,opts){
  opts=opts||{};
  const items=data.filter(d=>num(d.value)>0);
  const total=items.reduce((s,d)=>s+num(d.value),0);
  if(!items.length||total<=0)return '<div class="muted">No data yet.</div>';
  const W=260,H=220,cx=110,cy=110,r=92,rInner=52;
  let angle=-Math.PI/2,paths='';
  const arcPoint=(a,rad)=>[cx+rad*Math.cos(a),cy+rad*Math.sin(a)];
  items.forEach((d,i)=>{
    const frac=num(d.value)/total;
    const a0=angle,a1=angle+frac*2*Math.PI;
    angle=a1;
    const large=frac>0.9999; // a single 100% slice needs a full circle, not an arc
    const [x0,y0]=arcPoint(a0,r),[x1,y1]=arcPoint(a1,r);
    const [ix0,iy0]=arcPoint(a0,rInner),[ix1,iy1]=arcPoint(a1,rInner);
    const color=d.color||`hsl(${(i*57)%360} 55% 50%)`;
    if(large){
      paths+=`<circle cx="${cx}" cy="${cy}" r="${(r+rInner)/2}" fill="none" stroke="${color}" stroke-width="${r-rInner}"><title>${esc(d.label)}: ${fmt$(d.value)}</title></circle>`;
    }else{
      const large_arc=frac>0.5?1:0;
      paths+=`<path d="M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large_arc} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${ix1.toFixed(2)},${iy1.toFixed(2)} A${rInner},${rInner} 0 ${large_arc} 0 ${ix0.toFixed(2)},${iy0.toFixed(2)} Z" fill="${color}"><title>${esc(d.label)}: ${fmt$(d.value)} (${pct(frac*100)})</title></path>`;
    }
  });
  const legend=items.map((d,i)=>{
    const color=d.color||`hsl(${(i*57)%360} 55% 50%)`;
    const frac=num(d.value)/total;
    return `<div style="display:flex;align-items:center;gap:7px;font-size:.82rem;padding:3px 0">
      <span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${color};flex:none"></span>
      <span style="flex:1">${esc(d.label)}</span>
      <span style="font-weight:600">${fmt$0(d.value)}</span>
      <span class="muted" style="min-width:42px;text-align:right">${pct(frac*100)}</span>
    </div>`;
  }).join('');
  return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    <div class="chart" style="flex:none;width:170px"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria||'Pie chart')}">${paths}
      ${opts.center?`<text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink)">${esc(opts.center)}</text><text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(opts.centerSub||'')}</text>`:''}
    </svg></div>
    <div style="flex:1;min-width:160px">${legend}</div>
  </div>`;
}
const FY_MONTHS=['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
function monthIndexFY(dateISO){const mm=+dateISO.slice(5,7);return (mm+5)%12;} // Jul=0 … Jun=11

/* ---------- Travel distance helpers (Nominatim geocode + OSRM routing) ---------- */
async function geocodeAU(addr){
  const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=au`,
    {headers:{'Accept-Language':'en-AU','User-Agent':'LedgerAU/3.0'}});
  if(!r.ok)throw new Error('Geocode failed');
  const j=await r.json();if(!j.length)throw new Error('Address not found — try a more specific address');
  return{lat:+j[0].lat,lng:+j[0].lon,display:j[0].display_name};
}
async function roadDistKm(from,to){
  const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`);
  if(!r.ok)throw new Error('Routing failed');
  const j=await r.json();
  if(j.code!=='Ok')throw new Error('No route found');
  return j.routes[0].distance/1000; // metres → km
}
async function calcTravelDistance(fromAddr,toAddr){
  toast('Calculating route…');
  const [a,b]=await Promise.all([geocodeAU(fromAddr),geocodeAU(toAddr)]);
  const km=await roadDistKm(a,b);
  return Math.round(km*10)/10;
}

/* ---------- Expense recurrence helpers ---------- */
const RECURRENCE_OPTS=[['weekly','Weekly (×52)'],['fortnightly','Fortnightly (×26)'],['monthly','Monthly (×12)'],['quarterly','Quarterly (×4)'],['yearly','Yearly (×1)'],['once','One-off']];
const PRETAX_DED_TYPES=['Additional super contributions','Novated lease','Workplace giving','Purchased annual leave','Other salary sacrifice'];
const EXPENSE_CATS=['Housing','Transport','Food & groceries','Utilities','Insurance','Healthcare','Entertainment','Education','Clothing','Subscriptions','Donations','Travel','Investment / savings','Other'];
/* Deduction categories for the generic "this expense has a tax-deductible
   portion" flow on the Expenses page — distinct from PROP_CATS (which is
   specifically for investment property expenses entered via Assets).
   Most personal deductible expenses aren't property-related at all. */
const GENERAL_DED_CATS=['Donations / gifts (deductible gift recipients)','Managing tax affairs (accountant, tax agent fees)','Income protection insurance','Professional memberships & subscriptions','Union or professional association fees','Self-education related to your job','Tools & equipment','Other work-related expense'];
function yearlyFromRec(amount,rec){const m={weekly:52,fortnightly:26,monthly:12,quarterly:4,yearly:1,once:1};return amount*(m[rec]||12);}
function monthlyFlowForFY(exp,y){
  // Returns 12-element array (Jul=0 … Jun=11) of amounts
  const r=new Array(12).fill(0);
  const monthly=yearlyFromRec(num(exp.amount),exp.recurrence)/12;
  switch(exp.recurrence){
    case 'weekly':case 'fortnightly':case 'monthly':case 'quarterly':
      r.fill(monthly);break;
    case 'yearly':case 'once':
      if(exp.date){const i=monthIndexFY(exp.date);if(i>=0&&i<12)r[i]+=num(exp.amount);}
      break;
    default:r.fill(monthly);
  }
  return r;
}
/* Cash income for a person/FY — salary, dividend cash + franking credit,
   fund cash payments, and rental. Deliberately distinct from "assessable
   income" (used for tax): excludes AMIT label assessable amounts and
   capital gains, since this is meant as a cashflow/budgeting figure, not
   a tax figure. Shared by both the single-person and household dashboard
   views so the formula can't drift out of sync between them. */
function cashIncomeYearly(b,pid,y){
  const rentalYr=(typeof assetsForPerson==='function')?assetsForPerson([pid]).filter(a=>a.kind==='property'&&a.rental?.history?.length).reduce((s,a)=>s+rentalIncomeEffective(a,y),0):0;
  return b.incomes.reduce((s,r)=>s+num(r.yearly),0)+b.dividends.reduce((s,d)=>s+num(d.payment)+num(d.frankingCredit),0)+(b.fundPayments||[]).reduce((s,p)=>s+num(p.amount),0)+rentalYr;
}
function incomeMonthlyForFY(b,pid){
  const r=new Array(12).fill(0);
  (b.incomes||[]).forEach(inc=>{
    // "Once" (non-recurring) and "Yearly" income both happen on a single
    // specific date within the FY, not spread across every month — only
    // genuinely repeating frequencies (weekly/fortnightly/monthly/
    // quarterly) get averaged evenly as an approximation.
    if((inc.recurring===false||inc.recurrence==='yearly')&&inc.date){r[monthIndexFY(inc.date)]+=num(inc.yearly);}
    else{r.forEach((_,i)=>{r[i]+=num(inc.yearly)/12;});}
  });
  (b.dividends||[]).forEach(d=>{if(d.date&&num(d.payment))r[monthIndexFY(d.date)]+=num(d.payment);});
  (b.fundPayments||[]).forEach(p=>{if(p.date&&num(p.amount))r[monthIndexFY(p.date)]+=num(p.amount);});
  // Rental income from investment property assets, prorated by month —
  // pid is optional for backward compatibility with existing call sites
  // that don't pass it (rental income just won't be included for those).
  if(pid&&typeof assetsForPerson==='function'){
    const y=FY();
    assetsForPerson([pid]).filter(a=>a.kind==='property'&&a.rental?.history?.length).forEach(a=>{
      const m=rentalIncomeMonthlyForFY(a,y);
      m.forEach((v,i)=>{r[i]+=v;});
    });
  }
  return r;
}
/* Distributes a budget row's yearly amount across the 12 FY months
   (Jul=0..Jun=11), based on its `per` schedule:
   - weekly/monthly: spread evenly across all 12 months
   - bi-annual: half the yearly amount in each of its two occurrence months
   - yearly: the full amount in its one occurrence month
   `schedDay` for yearly/bi-annual is a CALENDAR month (1=Jan..12=Dec),
   converted to an FY-month-index here. */
function budCalMonthToFYIdx(calMonth){return((num(calMonth)||1)-7+12)%12;}
function budMonthlyFlow(rows){
  const r=new Array(12).fill(0);
  (rows||[]).forEach(row=>{
    const per=row.per||'m';
    const yearly=yrOf(row);
    if(per==='y'){
      r[budCalMonthToFYIdx(row.schedDay)]+=yearly;
    }else if(per==='b'){
      const m1=num(row.schedDay)||1,m2=((m1-1+6)%12)+1;
      const half=yearly/2;
      r[budCalMonthToFYIdx(m1)]+=half;
      r[budCalMonthToFYIdx(m2)]+=half;
    }else{
      const monthly=yearly/12;
      for(let i=0;i<12;i++)r[i]+=monthly;
    }
  });
  return r;
}
function expensesMonthlyForFY(b){
  const r=new Array(12).fill(0);
  (b.expenses||[]).forEach(e=>{
    const m=monthlyFlowForFY(e,null);
    m.forEach((v,i)=>{r[i]+=v;});
  });
  // Investment property expenses (entered via Assets → property card →
  // "Deductions by financial year") are one-off dated items, not part of
  // b.expenses — but they're real cashflow, so include them in the monthly
  // expenses chart too.
  (b.property?.expenses||[]).forEach(e=>{
    if(!e.date)return;
    const i=monthIndexFY(e.date);
    if(i>=0&&i<12)r[i]+=num(e.amount);
  });
  return r;
}
/* The portion of a property expense that's tax-deductible. Defaults to the
   full amount (100% deductible) for any entry without an explicit
   deductibleAmount — e.g. insurance, rates. For a mortgage repayment,
   deductibleAmount would be set to just the interest component. */
function propExpDeductible(e){
  return num(e.deductibleAmount!==undefined?e.deductibleAmount:e.amount);
}
/* True if this expense's category is bundled into a novated lease covering
   the linked vehicle — i.e. the cost is already paid via salary sacrifice
   (and already excluded from taxable income as a pre-tax deduction), so it
   shouldn't ALSO be claimed as a separate deduction here. */
function leaseIncludesExpense(e,b,pid){
  if(!e.assetId)return false;
  const lease=(b.preTaxDeds||[]).find(r=>r.type==='Novated lease'&&r.vehicleId===e.assetId);
  if(!lease)return false;
  return (lease.includedExpenseCategories||[]).includes(e.category);
}
function propExpDeductibleEffective(e,b,pid){
  if(leaseIncludesExpense(e,b,pid))return 0;
  return propExpDeductible(e);
}

/* Monthly property-expense cashflow (full amount, not just deductible) for
   an FY — used alongside rental income for the cashflow chart. */
function propertyExpensesMonthlyForFY(y,pids){
  const r=new Array(12).fill(0);
  (pids||[]).forEach(pid=>{
    bucket(y,pid).property.expenses.forEach(e=>{
      if(!e.date)return;
      const i=monthIndexFY(e.date);
      if(i>=0&&i<12)r[i]+=num(e.amount);
    });
  });
  // Include management fee — spread evenly across the 12 FY months
  // (it's a % of rent so it accrues in proportion to rental income,
  //  but distributing evenly is a reasonable cashflow approximation)
  const propertyAssets=(typeof assetsForPerson==='function')
    ?assetsForPerson(pids||[]).filter(a=>a.kind==='property'):[];
  propertyAssets.forEach(a=>{
    const fee=managementFeeForFY(a,y);
    if(fee>0){const monthly=fee/12;for(let i=0;i<12;i++)r[i]+=monthly;}
  });
  return r;
}

/* ---------- Rental income calculation ---------- */
function rentalYearly(amount, frequency){
  const map={weekly:52,fortnightly:26,monthly:12,quarterly:4,yearly:1};
  return num(amount)*(map[frequency]||52);
}
function rentalIncomeForFY(asset, y){
  const hist=(asset.rental?.history||[]).slice().sort((a,b)=>a.startDate<b.startDate?-1:1);
  if(!hist.length)return 0;
  const {start,end}=fyRange(y);
  // Never count rental income before the asset was actually acquired, even
  // if a rental-rate entry's "effective from" date is earlier (e.g. left
  // at its default, or the property was rented before settlement by
  // mistake) — ownership start is the hard floor.
  const ownedFrom=asset.purchaseDate||null;
  let total=0;
  hist.forEach((period,i)=>{
    const nextStart=hist[i+1]?.startDate||null;
    // Period runs from period.startDate until next period starts (or forever)
    const pStart=ownedFrom&&ownedFrom>period.startDate?ownedFrom:period.startDate,pEnd=nextStart;
    // Intersect with FY
    const oStart=pStart>start?pStart:start;
    const oEnd=(pEnd&&pEnd<end)?pEnd:end;
    if(oStart>=oEnd)return;
    const days=(new Date(oEnd+'T00:00:00Z')-new Date(oStart+'T00:00:00Z'))/86400000;
    const daily=rentalYearly(period.amount,period.frequency)/365.25;
    total+=daily*days;
  });
  return Math.round(total*100)/100;
}
/* Rental income for an FY, honouring a manual override if one is set —
   lets the person correct the auto-calculated figure (e.g. a tenant
   missed a payment, or a vacancy period wasn't logged as a rate change)
   without having to fake the rental rate history. Falls through to the
   calculated value when no override exists for this FY. */
function rentalIncomeEffective(asset,y){
  const ov=asset.rentalOverrides&&asset.rentalOverrides[String(y.startYear)];
  return ov!=null?num(ov):rentalIncomeForFY(asset,y);
}
/* Rental income distributed across the 12 FY months (Jul=0..Jun=11),
   prorating each rate period by the actual days it was in effect within
   each month — so a mid-year rent increase shows up in the right months
   instead of being smeared evenly across the whole year. Scaled to match
   a manual override if one is set, preserving the month-to-month shape. */
function rentalIncomeMonthlyForFY(asset,y){
  const r=new Array(12).fill(0);
  const hist=(asset.rental?.history||[]).slice().sort((a,b)=>a.startDate<b.startDate?-1:1);
  if(!hist.length)return r;
  const {start,end}=fyRange(y);
  const ownedFrom=asset.purchaseDate||null;
  const fyStart=new Date(start+'T00:00:00Z');
  for(let m=0;m<12;m++){
    const monthStart=new Date(Date.UTC(fyStart.getUTCFullYear(),fyStart.getUTCMonth()+m,1));
    const monthEnd=new Date(Date.UTC(fyStart.getUTCFullYear(),fyStart.getUTCMonth()+m+1,1));
    const mStartISO=iso(monthStart);
    // Clip to the FY's own (exclusive) end boundary — matches
    // rentalIncomeForFY's day-counting exactly, so this monthly
    // breakdown always sums to the same FY total shown elsewhere.
    let mEndISO=iso(monthEnd);
    if(mEndISO>end)mEndISO=end;
    let monthTotal=0;
    hist.forEach((period,i)=>{
      const nextStart=hist[i+1]?.startDate||null;
      const pStart=ownedFrom&&ownedFrom>period.startDate?ownedFrom:period.startDate;
      const pEnd=nextStart;
      const oStart=pStart>mStartISO?pStart:mStartISO;
      const oEnd=(pEnd&&pEnd<mEndISO)?pEnd:mEndISO;
      if(oStart>=oEnd)return;
      const days=(new Date(oEnd+'T00:00:00Z')-new Date(oStart+'T00:00:00Z'))/86400000;
      const daily=rentalYearly(period.amount,period.frequency)/365.25;
      monthTotal+=daily*days;
    });
    r[m]=monthTotal;
  }
  const calcTotal=r.reduce((s,v)=>s+v,0);
  const ov=asset.rentalOverrides&&asset.rentalOverrides[String(y.startYear)];
  if(ov!=null&&calcTotal>0){
    const scale=num(ov)/calcTotal;
    for(let m=0;m<12;m++)r[m]*=scale;
  }
  return r.map(v=>Math.round(v*100)/100);
}
function rentalCurrentRate(asset){
  const hist=(asset.rental?.history||[]).slice().sort((a,b)=>a.startDate<b.startDate?-1:1);
  const today=todayISO();
  let cur=null;
  for(const p of hist){if(p.startDate<=today)cur=p;}
  return cur;
}
/* Rental rate period(s) that were actually in effect at some point during
   a given FY — there can be more than one if the rate changed mid-year
   (e.g. a rent increase), which is common and "current rate" alone would
   misrepresent. Returned in chronological order. */
function rentalRatesForFY(asset,y){
  const hist=(asset.rental?.history||[]).slice().sort((a,b)=>a.startDate<b.startDate?-1:1);
  if(!hist.length)return[];
  const {start,end}=fyRange(y);
  const periods=[];
  hist.forEach((p,i)=>{
    const pStart=p.startDate;
    const pEnd=hist[i+1]?.startDate||'9999-12-31';
    if(pEnd>start&&pStart<end)periods.push(p);
  });
  return periods;
}
/* Short display string for the FY-relevant rate(s), e.g. "$500/weekly"
   or "$500/weekly → $550/weekly" when it changed mid-FY. */
function rentalRateDisplayForFY(asset,y){
  const periods=rentalRatesForFY(asset,y);
  if(!periods.length)return'';
  return periods.map(p=>`${fmt$(p.amount)}/${p.frequency}`).join(' → ');
}
/* ---------- Property management fee (% of rent, tracked historically) ---------- */
function managementFeeRateAt(asset,dateISO){
  const hist=(asset.managementFeeHistory||[]).slice().sort((a,b)=>a.startDate<b.startDate?-1:1);
  let rate=null;
  hist.forEach(h=>{if(h.startDate<=dateISO)rate=num(h.pct);});
  return rate;
}
function managementFeeCurrentRate(asset){
  const hist=(asset.managementFeeHistory||[]).slice().sort((a,b)=>a.startDate<b.startDate?-1:1);
  const today=todayISO();
  let cur=null;
  for(const h of hist){if(h.startDate<=today)cur=h;}
  return cur;
}
/* Management fee for an FY = fee% × that FY's rental income.
   The rental income itself is already prorated by ownership/rental start date
   via rentalIncomeEffective, so no separate date-of-ownership proration is needed.
   Rate used is the one in effect at FY end (agents rarely change mid-year). */
function managementFeeForFY(asset,y){
  if(asset.kind!=='property'||asset.investment===false)return 0;
  const rate=managementFeeRateAt(asset,fyRange(y).end);
  if(rate==null||rate===0)return 0;
  return Math.round(rentalIncomeEffective(asset,y)*rate/100*100)/100;
}
/* ---------- Depreciation schedule (Div43 capital works + Div40 plant &
   equipment), manually entered per FY from a quantity surveyor report ---------- */
function depreciationRowForFY(asset,y){
  return (asset.depreciationSchedule||[]).find(r=>Number(r.fy)===fyOrderYear(y))||null;
}
function depreciationForFY(asset,y){
  if(asset.kind!=='property'||asset.investment===false)return 0;
  const row=depreciationRowForFY(asset,y);
  if(!row)return 0;
  return num(row.capitalWorks)+num(row.plantEquipment);
}

/* ---------- Address autocomplete (Nominatim/OSM — same free service used
   for distance calculation, no API key needed) ---------- */
let _addrDebounce={};
async function addrAutocomplete(input,suggId){
  const q=input.value.trim();
  const sugg=document.getElementById(suggId);
  if(!sugg)return;
  clearTimeout(_addrDebounce[suggId]);
  if(q.length<3){sugg.innerHTML='';sugg.style.display='none';return;}
  _addrDebounce[suggId]=setTimeout(async()=>{
    try{
      const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=au`,
        {headers:{'Accept-Language':'en-AU'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const js=await r.json();
      if(!js.length){sugg.innerHTML='';sugg.style.display='none';return;}
      sugg.innerHTML=js.map(item=>`<div class="addr-sugg-item" onmousedown="addrPick('${input.id}','${suggId}',this)" data-val="${esc(item.display_name)}">${esc(item.display_name)}</div>`).join('');
      sugg.style.display='block';
    }catch(e){sugg.innerHTML='';sugg.style.display='none';}
  },400);
}
function addrPick(inputId,suggId,el){
  const input=document.getElementById(inputId);
  input.value=el.dataset.val;
  const sugg=document.getElementById(suggId);
  sugg.innerHTML='';sugg.style.display='none';
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
function addrHide(suggId){
  setTimeout(()=>{const s=document.getElementById(suggId);if(s)s.style.display='none';},150);
}
/* ================= CUSTOM SELECT UPGRADE ================= */
let _cselOpen=null;
function upgradeSels(root){
  (root||document).querySelectorAll('select.input:not([data-csu])').forEach(sel=>{
    sel.setAttribute('data-csu','1');
    const wrap=document.createElement('div');
    wrap.className='csel';
    sel.parentNode.insertBefore(wrap,sel);
    wrap.appendChild(sel);
    sel.style.cssText='position:absolute;opacity:0;pointer-events:none;top:0;left:0;width:100%;height:100%';
    const cur=sel.options[sel.selectedIndex];
    const btn=document.createElement('button');
    btn.type='button';btn.className='input csel-btn';
    btn.innerHTML=`<span class="csel-cur">${esc(cur?cur.text:'')}</span><svg width="10" height="6" viewBox="0 0 10 6" class="csel-chev"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    wrap.insertBefore(btn,sel);
    const ul=document.createElement('ul');ul.className='csel-opts';ul.setAttribute('role','listbox');
    const rebuild=()=>{
      ul.innerHTML='';
      [...sel.options].forEach(opt=>{
        const li=document.createElement('li');
        li.className='csel-opt'+(opt.selected?' sel':'');
        li.setAttribute('role','option');li.dataset.v=opt.value;
        li.textContent=opt.text;
        li.addEventListener('mousedown',ev=>{ev.preventDefault();});
        li.addEventListener('click',()=>{
          sel.value=opt.value;
          btn.querySelector('.csel-cur').textContent=opt.text;
          ul.querySelectorAll('.csel-opt').forEach(x=>x.classList.remove('sel'));
          li.classList.add('sel');
          wrap.classList.remove('open');_cselOpen=null;
          sel.dispatchEvent(new Event('change',{bubbles:true}));
        });
        ul.appendChild(li);
      });
    };
    rebuild();
    // Re-sync if select options change dynamically
    const obs=new MutationObserver(rebuild);
    obs.observe(sel,{childList:true,subtree:true,attributes:true,attributeFilter:['selected']});
    wrap.appendChild(ul);
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      if(_cselOpen&&_cselOpen!==wrap){_cselOpen.classList.remove('open');}
      const willOpen=!wrap.classList.contains('open');
      wrap.classList.toggle('open',willOpen);
      _cselOpen=willOpen?wrap:null;
      if(willOpen){
        // Flip upward if not enough space below
        const r=wrap.getBoundingClientRect();
        ul.style.bottom=(r.bottom+250>window.innerHeight)?'calc(100% + 3px)':'';
        ul.style.top=(r.bottom+250>window.innerHeight)?'auto':'calc(100% + 3px)';
      }
    });
    // Keep hidden select in sync when changed externally
    sel.addEventListener('change',()=>{
      const chosen=sel.options[sel.selectedIndex];
      if(chosen)btn.querySelector('.csel-cur').textContent=chosen.text;
    });
  });
  document.addEventListener('click',()=>{if(_cselOpen){_cselOpen.classList.remove('open');_cselOpen=null;}},{once:false,capture:false});
}

/* ================= ROUTER & SHELL ================= */
const PAGES={};
let currentPage='dashboard';
const PERSON_PAGES=new Set(['income','expenses','dividends','funds','sales','wfh','other','super']);
function go(page){
  currentPage=page;
  $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  render();
  // On mobile the nav is collapsed by default — auto-close it after picking
  // a page so the user lands straight on the content without an extra tap.
  if(window.innerWidth<=1000)navSetOpen(false);
}
/* Mobile nav collapse toggle. Collapsed by default — only the "Menu" button
   is visible until tapped. On desktop these elements are always visible
   (the collapse classes only take effect under the 1000px media query). */
function navSetOpen(open){
  const el=$('#navCollapse'),btn=$('#navToggle'),label=$('#navToggleLabel');
  if(!el||!btn)return;
  el.classList.toggle('open',open);
  btn.setAttribute('aria-expanded',open?'true':'false');
  if(label)label.textContent=open?'Close menu':'Menu';
}
function navToggle(){navSetOpen(!$('#navCollapse')?.classList.contains('open'));}
/* Shown at the top of every page while the selected FY has ended but isn't
   locked yet — a gentle, persistent (until locked or dismissed) nudge to
   review and freeze it. Locking protects its figures/rates from future
   edits, and ties into Version history if anything needs undoing. */
function lockNudgeBanner(){
  const y=FY();
  if(!y||y.locked||!fyIsPast(y)||y._lockNudgeDismissed)return '';
  return `<div class="card" style="border-color:var(--gold);background:var(--gold-soft)">
    <div class="cbody" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><b>${esc(fyDisplay(y))} has ended.</b> Once everything's entered, consider locking it to freeze its tax rates and protect its figures from future edits — you can always unlock it later if you spot a mistake.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary small" onclick="settingsLock();render()">🔒 Lock ${esc(fyDisplay(y))}</button>
        <button class="btn ghost small" onclick="FY()._lockNudgeDismissed=true;save();render()">Dismiss</button>
      </div>
    </div></div>`;
}
const ALL_TIME_OK_PAGES=new Set(['assets','networth','trends','settings','assetDetail','documents']);
function fyQuickPick(v){DB.currentFY=v;save();autoRefreshHolidays();render();}
function render(){
  renderPeopleSwitch();
  const m=$('#main');m.innerHTML='';
  m.insertAdjacentHTML('beforeend',lockNudgeBanner());
  if(isAll()&&PERSON_PAGES.has(currentPage))return householdDataPage(m);
  if(isAllFY()&&!ALL_TIME_OK_PAGES.has(currentPage)){
    const years=Object.values(DB.years).sort((a,b)=>fyOrderYear(b)-fyOrderYear(a));
    m.insertAdjacentHTML('beforeend',`<div class="card"><div class="cbody">
      <h2 style="margin-top:0">Pick a financial year</h2>
      <p class="muted">This page works with one financial year at a time. "All time" is great for browsing Assets, Net worth, and Trends — switch to a specific year below to see or edit this page.</p>
      <select class="input" style="max-width:280px" onchange="fyQuickPick(this.value)">
        <option value="" disabled selected>Choose a financial year…</option>
        ${years.map(y=>`<option value="${y.startYear}">${esc(fyDisplay(y))}${y.locked?' 🔒':''}</option>`).join('')}
      </select>
    </div></div>`);
    return;
  }
  (PAGES[currentPage]||PAGES.dashboard)(m);
  requestAnimationFrame(()=>{
    upgradeSels($('#main'));
    // indeterminate is a DOM property, not an HTML attribute — must be set after render
    $$('.div-group-cb[data-indeterminate]').forEach(cb=>{cb.indeterminate=true;});
  });
}
function renderPeopleSwitch(){
  const w=$('#peopleSwitch');if(!w)return;
  const chips=DB.people.map(p=>`<button class="${DB.currentPid===p.id?'active':''}" onclick="setPerson('${p.id}')">${pdot(p)}${esc(p.name)}</button>`).join('');
  const hh=DB.people.length>1?`<button class="${isAll()?'active':''}" onclick="setPerson('all')">⌂ Household</button>`:'';
  w.innerHTML=chips+hh;
  applyPersonAccent();
}
/* Tints a few key UI accents (active nav highlight, a top border) with the
   currently-viewed person's chosen colour, so it's obvious at a glance who
   you're looking at. Household view stays neutral/uncoloured, as requested. */
function applyPersonAccent(){
  const root=document.documentElement;
  if(isAll()||!DB.people.length){
    root.style.removeProperty('--person-accent');
    root.style.removeProperty('--person-accent-soft');
    root.style.removeProperty('--person-accent-ink');
    return;
  }
  const p=person(DB.currentPid);
  if(!p||!p.color){
    root.style.removeProperty('--person-accent');
    root.style.removeProperty('--person-accent-soft');
    root.style.removeProperty('--person-accent-ink');
    return;
  }
  root.style.setProperty('--person-accent',p.color);
  root.style.setProperty('--person-accent-soft',`color-mix(in srgb, ${p.color} 18%, var(--surface))`);
  root.style.setProperty('--person-accent-ink',`color-mix(in srgb, ${p.color} 70%, black)`);
}
function setPerson(pid){DB.currentPid=pid;save();render();}
function personTag(){
  if(isAll())return `<span class="personline">⌂ Household — ${DB.people.map(p=>esc(p.name)).join(' + ')}</span>`;
  const p=person(DB.currentPid);return `<span class="personline">${pdot(p)}${esc(p.name)}</span>`;
}
function head(m,title,sub,actionsHTML){
  const y=FY();
  m.insertAdjacentHTML('beforeend',`<div class="pagehead"><div>
    <h1>${title}</h1><div class="sub">${personTag()} · ${sub||''}</div></div>
    <div class="headactions">${y.locked?'<span class="stamp"><span class="big">'+esc(y.label)+'</span><span>rates frozen</span></span>':''}${actionsHTML||''}</div></div>`);
}
function modal(title,bodyHTML,footHTML){
  const r=$('#modalRoot');
  r.innerHTML=`<div class="modal-back"><div class="modal" role="dialog" aria-label="${esc(title)}">
    <div class="mhead"><h3>${esc(title)}</h3><button class="btn ghost small" data-close>✕</button></div>
    <div class="mbody">${bodyHTML}</div><div class="mfoot">${footHTML||'<button class="btn" data-close>Close</button>'}</div></div></div>`;
  const back=r.querySelector('.modal-back');
  // Close-on-backdrop-click: only close if BOTH the press AND release happened on
  // the bare backdrop itself — using elementFromPoint at release time so that
  // pointer capture (which keeps touch events targeted at their origin element
  // even after the finger moves elsewhere) can't cause a false "outside" close.
  let downOnBackdrop=false;
  back.addEventListener('pointerdown',e=>{downOnBackdrop=(e.target===back);});
  back.addEventListener('pointerup',e=>{
    if(!downOnBackdrop)return;
    downOnBackdrop=false;
    const el=document.elementFromPoint(e.clientX,e.clientY);
    if(el===back)closeModal();
  });
  back.addEventListener('pointercancel',()=>{downOnBackdrop=false;});
  // [data-close] buttons (X, Cancel, etc.) — simple click is fine, press+release
  // both land on the button in normal use.
  back.addEventListener('click',e=>{
    if(e.target.closest('[data-close]'))closeModal();
  });
  return r;
}
function closeModal(){$('#modalRoot').innerHTML='';}
let _delFn=null;
function confirmDel(msg,fn){
  _delFn=fn;
  modal('Confirm delete',`<p style="margin-bottom:12px">${msg}</p>`,
    `<button class="btn" data-close>Cancel</button><button class="btn danger" onclick="closeModal();if(_delFn){const _f=_delFn;_delFn=null;_f();}" >Delete</button>`);
}
/* Generic confirm dialog for non-destructive-sounding actions (e.g. Revert)
   where confirmDel's "Confirm delete / Delete" wording would be misleading. */
function confirmAction(title,msg,btnLabel,fn){
  _delFn=fn;
  modal(title,`<p style="margin-bottom:12px">${msg}</p>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="closeModal();if(_delFn){const _f=_delFn;_delFn=null;_f();}">${esc(btnLabel)}</button>`);
}
function lockedGuard(){const y=FY();if(y.locked){toast(y.label+' is locked. Unlock it in Tax settings to edit.');return true;}return false;}

/* Household view of a per-person data page: read-only overview + jump-in buttons */
function householdDataPage(m){
  const y=FY();
  const labels={income:'Income',expenses:'Expenses',dividends:'Share dividends',funds:'ETF / Managed Funds',sales:'Share sales',wfh:'WFH tracker',other:'Other deductions & devices',super:'Superannuation'};
  head(m,labels[currentPage]||'Records',`Household view of ${esc(y.label)}. Pick a person below (or in the sidebar) to view and edit their records.`,'');
  const rows=DB.people.map(pp=>{
    const b=bucket(y,pp.id);let v='';
    switch(currentPage){
      case 'income':{const t=b.incomes.reduce((s,r)=>s+num(r.yearly),0);v=`${b.incomes.length} source(s) · ${fmt$0(t)} / yr`;break;}
      case 'dividends':{const t=b.dividends.reduce((s,d)=>s+num(d.payment),0),c=b.dividends.reduce((s,d)=>s+num(d.frankingCredit),0);v=`${b.dividends.length} payment(s) · ${fmt$0(t)} + ${fmt$0(c)} credits`;break;}
      case 'funds':{const eoy=b.funds.reduce((s,f)=>s+num(f.eoyValue),0);v=`${b.funds.length} holding(s) · EOY value ${fmt$0(eoy)}`;break;}
      case 'sales':{v=`${b.sales.length} sale(s)`;break;}
      case 'wfh':{const t=wfhTotals(y,b);v=`${t.days} WFH days · ${fmt$(t.claim)} claimable`;break;}
      case 'property':{const t=b.property.expenses.reduce((s,e)=>s+num(e.amount),0);v=`${b.property.expenses.length} expense(s) · ${fmt$0(t)}`;break;}
      case 'other':{const t=b.other.reduce((s,e)=>s+num(e.amount),0)+b.devices.reduce((s,d)=>s+deviceDeductionForFY(d,y),0);v=`${b.other.length+b.devices.length} item(s) · ${fmt$0(t)}`;break;}
      case 'super':{
        const items=DB.nw.items.filter(it=>it.pid===pp.id&&it.kind==='super');
        const bal=items.reduce((s,it)=>{const es=nwEntriesOf(it.id);return s+(es.length?num(es[es.length-1].value):0);},0);
        v=`${items.length} fund(s) · ${fmt$0(bal)} balance`;break;
      }
    }
    return `<div class="kv"><span class="k">${pdot(pp)} ${esc(pp.name)} <span class="muted">— ${v}</span></span>
      <button class="btn small" onclick="setPerson('${pp.id}')">Open ${esc(pp.name)}'s</button></div>`;
  }).join('');
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="cbody">${rows}</div></div>
  <div class="note">Records are kept per person because Australian tax is assessed individually. The Dashboard, FY summary and Net worth pages combine everyone when “Household” is selected.</div>`);
}

/* ================= DASHBOARD ================= */
let DASH_OPEN=null;
function dashToggle(k){
  DASH_OPEN=DASH_OPEN===k?null:k;
  go('dashboard');
  // On mobile, scroll the expanded panel into view so it's clearly connected
  if(DASH_OPEN){requestAnimationFrame(()=>{
    const el=document.querySelector('.dash-stat-grid .dex.open');
    if(el)el.scrollIntoView({behavior:'smooth',block:'nearest'});
  });}
}
function dxRow(n,a,sub,link){return `<div class="dex-row${sub?' sub':''}"><span class="n">${n}${link?` <a class="dex-lnk" onclick="${link};return false" href="#">↗</a>`:''}</span><span class="a">${a}</span></div>`;}
function dxTot(n,a){return `<div class="dex-row tot"><span class="n">${n}</span><span class="a">${a}</span></div>`;}

PAGES.dashboard=m=>{
  const y=FY();
  if(isAll())return dashboardHousehold(m,y);
  const pid=DB.currentPid,b=PD(),R=y.rates;
  const s=fySummaryNumbers(y,pid);
  const divTot=b.dividends.reduce((sm,d)=>sm+num(d.payment),0);
  const frkTot=b.dividends.reduce((sm,d)=>sm+num(d.frankingCredit),0);
  const incTot=b.incomes.reduce((sm,i)=>sm+num(i.yearly),0);
  const wfhStats=wfhTotals(y,b);
  const yearlyExp=(b.expenses||[]).reduce((s,e)=>s+yearlyFromRec(num(e.amount),e.recurrence),0)+b.property.expenses.reduce((s,e)=>s+num(e.amount),0);
  const {start,end}=fyRange(y);
  const surplus=s.assessable-s.tax.total-yearlyExp;

  // Net worth — latest entry for each item on or before FY end date
  const nwItems=DB.nw?.items.filter(it=>it.pid===pid)||[];
  const nwTotal=nwItems.reduce((sum,it)=>{
    const es=nwEntriesOf(it.id).filter(e=>e.date<=end);
    return sum+(es.length?es[es.length-1].value:0);
  },0);

  head(m,'Dashboard',`${fyDisplay(y)} · Overview`,
    `<button class="btn small" onclick="privacyToggle()">◉ Privacy</button>
     <button class="btn primary small" onclick="go('income')">+ Add entry</button>`);

  // ── Expandable detail panel builder (shared helper) ──
  const dxPanel=(key,col,title,rowsHTML)=>
    `<div style="grid-column:1/-1;margin-top:-4px"><div class="dex open" style="border-top:3px solid ${col}">
      <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:${col};font-weight:700;margin-bottom:10px">▲ ${title}</div>
      ${rowsHTML}</div></div>`;

  // ── Row 1: 4 expandable stat cards ──
  const buildR1Dex=()=>{
    if(DASH_OPEN==='income'){
      const rentAssets=(typeof assetsForPerson==='function')?assetsForPerson([pid]).filter(a=>a.kind==='property'&&a.rental?.history?.length):[];
      const L=k2=>b.funds.reduce((sum,f)=>sum+num(f.labels?.[k2]),0);
      const fundTot=L('13U')+L('13C')+L('18A')+L('18H')+L('20E')+L('20M')+L('20F')+L('20O')+(b.fundPayments||[]).reduce((s,p)=>s+num(p.amount),0);
      let rows=b.incomes.map(r=>dxRow(esc(r.name)+' <span class="muted">('+esc(r.kind||'salary')+')</span>',fmt$(r.yearly),true,"go('income')")).join('');
      if(divTot)rows+=dxRow('Dividends received',fmt$(divTot)+' <span class="muted">(+'+fmt$(frkTot)+' franking)</span>',true,"go('dividends')");
      if(fundTot)rows+=dxRow('Managed fund income',fmt$(fundTot),true,"go('funds')");
      rentAssets.forEach(a=>{const inc=rentalIncomeEffective(a,y);if(inc)rows+=dxRow('Rental — '+esc(a.name),fmt$(inc),true,"go('assets')");});
      if(s.netCG)rows+=dxRow('Net capital gains',fmt$(s.netCG),true,"go('assets')");
      rows+=dxTot('Assessable income',fmt$(s.assessable));
      return dxPanel('income','var(--euc)','Gross income breakdown',rows);
    }
    if(DASH_OPEN==='expenses'){
      const byCat={};
      (b.expenses||[]).forEach(e=>{const y2=yearlyFromRec(num(e.amount),e.recurrence);byCat[e.category||'Other']=(byCat[e.category||'Other']||0)+y2;});
      const propCash=b.property.expenses.reduce((s,e)=>s+num(e.amount),0);
      let rows=Object.keys(byCat).sort((a,b2)=>byCat[b2]-byCat[a]).map(c=>dxRow(esc(c),fmt$0(byCat[c]),false,"go('expenses')")).join('');
      if(propCash)rows+=dxRow('Investment property',fmt$0(propCash),false,"go('assets')");
      if(!rows)rows='<div class="dex-row"><span class="muted">No expenses recorded yet — <a href="#" onclick="go(\'expenses\')">add some</a>.</span></div>';
      else rows+=dxTot('Total expenses',fmt$0(yearlyExp));
      return dxPanel('expenses','var(--red)','Expenses by category',rows);
    }
    if(DASH_OPEN==='savings'){
      let rows=dxRow('Assessable income',fmt$(s.assessable),true);
      rows+=dxRow('Tax payable',fmt$(-s.tax.total),false);
      rows+=dxRow('Total expenses',fmt$(-yearlyExp),false);
      rows+=dxTot('Net savings / surplus',fmt$(surplus));
      rows+=`<div class="dex-row" style="padding-top:8px"><a href="#" onclick="go('summary');return false" style="font-size:.82rem">→ See full FY summary</a></div>`;
      return dxPanel('savings',surplus>=0?'var(--euc)':'var(--red)','Net savings calculation',rows);
    }
    if(DASH_OPEN==='networth'){
      let rows=nwItems.length
        ?nwItems.map(it=>{
            const es=nwEntriesOf(it.id).filter(e=>e.date<=end);
            const v=es.length?es[es.length-1].value:null;
            if(v===null)return '';
            return dxRow(esc(it.name),fmt$(v),false,"go('networth')");
          }).filter(Boolean).join('')
        :'<div class="dex-row"><span class="muted">No net worth items yet — <a href="#" onclick="go(\'networth\')">add items</a>.</span></div>';
      if(nwItems.length)rows+=dxTot(`Net worth as at end of ${esc(fyDisplay(y))}`,fmt$(nwTotal));
      rows+=`<div class="dex-row" style="padding-top:8px"><a href="#" onclick="go('networth');return false" style="font-size:.82rem">→ Open net worth</a></div>`;
      return dxPanel('networth','var(--gold)','Net worth breakdown',rows);
    }
    return '';
  };

  const statCard=(key,cls,label,val,sub)=>
    `<div class="stat ${cls||''} ${DASH_OPEN===key?'xopen':''}" style="cursor:pointer" onclick="dashToggle('${key}')">
      <div class="l">${label}</div><div class="v">${val}</div>${sub?`<div class="d">${sub}</div>`:''}
      <div class="stat-toggle">${DASH_OPEN===key?'▲ less':'▼ details'}</div>
    </div>`;

  m.insertAdjacentHTML('beforeend',`<div class="dash-stat-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px">
    ${statCard('income','good','Gross income',fmt$0(s.assessable),'salary, dividends & more')}
    ${statCard('expenses','bad','Total expenses',fmt$0(yearlyExp),(b.expenses||[]).length+' item'+((b.expenses||[]).length===1?'':'s')+' tracked')}
    ${statCard('savings',surplus>=0?'good':'bad','Net savings',fmt$0(Math.abs(surplus)),surplus>=0?'surplus after tax + expenses':'shortfall')}
    ${statCard('networth','gold','Net worth',fmt$0(nwTotal),`as at end of ${esc(fyDisplay(y))}`)}
    ${buildR1Dex()}
  </div>`);

  // ── Row 2: cashflow chart (left) + income breakdown (right) ──
  const incomeMo=incomeMonthlyForFY(b,pid);
  const expMo=expensesMonthlyForFY(b);
  const cashData=FY_MONTHS.map((label,i)=>({label,value:incomeMo[i]||0,value2:expMo[i]||0}));

  const rentAssets2=(typeof assetsForPerson==='function')?assetsForPerson([pid]).filter(a=>a.kind==='property'&&a.rental?.history?.length):[];
  const rentalTot=rentAssets2.reduce((sum,a)=>sum+rentalIncomeEffective(a,y),0);
  const L2=k2=>b.funds.reduce((sum,f)=>sum+num(f.labels?.[k2]),0);
  const fundTot2=L2('13U')+L2('13C')+L2('18A')+L2('18H')+L2('20E')+L2('20M')+L2('20F')+L2('20O')+(b.fundPayments||[]).reduce((s,p)=>s+num(p.amount),0);
  const breakdownRows=[
    incTot?['Salary & income',incTot,'euc']:null,
    divTot?['Dividends',divTot+frkTot,'gold-badge']:null,
    fundTot2?['Managed funds',fundTot2,'blue']:null,
    rentalTot?['Rental income',rentalTot,'orange']:null,
    s.netCG?['Capital gains',s.netCG,'purple']:null,
  ].filter(Boolean);

  m.insertAdjacentHTML('beforeend',`<div style="display:grid;grid-template-columns:2fr 1fr;gap:18px;margin-bottom:18px">
    <div class="card"><div class="chead"><h2>Income vs expenses</h2>
      <span class="hint">Monthly — ${esc(fyDisplay(y))}</span></div>
      <div class="cbody">${barChartSVG(cashData,{aria:'Monthly cashflow',label2:'Expenses'})}
        <div style="display:flex;gap:16px;font-size:var(--text-sm);margin-top:6px;color:var(--muted)">
          <span><span style="display:inline-block;width:12px;height:12px;background:var(--euc);border-radius:3px;margin-right:5px;opacity:.85;vertical-align:-2px"></span>Income</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:var(--gold);border-radius:3px;margin-right:5px;opacity:.85;vertical-align:-2px"></span>Expenses</span>
        </div>
      </div>
    </div>
    <div class="card"><div class="chead"><h2>Income breakdown</h2></div>
      <div class="cbody">
        ${breakdownRows.length?breakdownRows.map(([k,v,c])=>`
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed var(--line);font-size:.9rem;align-items:center">
            <span style="color:var(--muted)">${k}</span>
            <span style="font-weight:var(--fw-semibold);font-variant-numeric:tabular-nums;color:var(--${c})">${fmt$(v)}</span>
          </div>`).join('')
          :`<div class="muted" style="padding:8px 0;font-size:.9rem">Add income entries to see a breakdown here.</div>`}
        <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-weight:var(--fw-bold);border-top:3px double var(--line2);margin-top:4px">
          <span>Total</span>
          <span style="font-variant-numeric:tabular-nums">${fmt$(s.assessable)}</span>
        </div>
      </div>
    </div>
  </div>`);

  // ── Upcoming novated lease alerts ──
  const upcomingLeases=[];
  const today=todayISO();const seen=new Set();
  Object.values(DB.years).forEach(fy=>{
    (bucket(fy,pid).preTaxDeds||[]).forEach(r=>{
      if(r.type!=='Novated lease'||seen.has(r.id))return;
      const end2=leaseEndDate(r);if(!end2)return;
      const diffDays=Math.round((new Date(end2+'T00:00:00Z')-Date.now())/86400000);
      if(diffDays>-30&&diffDays<400){seen.add(r.id);upcomingLeases.push({r,end:end2,diffDays,veh:r.vehicleId?DB.assets.find(a=>a.id===r.vehicleId):null});}
    });
  });
  if(upcomingLeases.length){
    const leaseRows=upcomingLeases.sort((a,b)=>a.end<b.end?-1:1).map(({r,end:end2,diffDays,veh})=>{
      const expired=diffDays<0,soonish=diffDays<90;
      const color=expired?'var(--red)':soonish?'var(--gold)':'var(--muted)';
      return `<div class="kv"><span class="k"><b style="color:${color}">${esc(r.name)}</b>${veh?' · 🚗 '+esc(veh.name):''}</span>
        <span class="v" style="color:${color}">${expired?'⚠ expired · ':''}${fmtDate(end2)} (${leaseCountdown(end2)})${r.residualAmount?` · residual <b>${fmt$0(r.residualAmount)}</b>`:''}</span></div>`;
    }).join('');
    m.insertAdjacentHTML('beforeend',`<div class="card" style="border-color:var(--gold);margin-bottom:18px"><div class="chead"><h2>🗓 Novated lease${upcomingLeases.length>1?'s':''} expiring</h2></div><div class="cbody">${leaseRows}</div></div>`);
  }

  // ── Row 3: Recent activity table ──
  const recentItems=[];
  const todayStr=todayISO();
  (b.incomes||[]).forEach(r=>{
    let itemDate=r.date||'';
    const rec=r.recurrence||'monthly';
    // For recurring income, synthesize last payment date from schedDay
    if(!itemDate&&(rec==='monthly'||rec==='fortnightly'||rec==='weekly')){
      const day=num(r.schedDay)||1;
      const now=new Date();
      const thisMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),Math.min(day,28)));
      const candidate=iso(thisMonth);
      itemDate=candidate>todayStr
        ?iso(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,Math.min(day,28))))
        :candidate;
    }
    if(!itemDate)return;
    // Per-period amount (not yearly total)
    const mult=REC_MULT[rec]||1;
    const periodGross=num(r.yearly)/mult;
    // Subtract any pre-tax deductions linked to this income source
    const linked=(b.preTaxDeds||[]).filter(p=>p.incomeId&&p.incomeId===r.id);
    const periodPreTax=linked.reduce((s,p)=>{
      const pm=REC_MULT[p.recurrence||'monthly']||1;
      return s+num(p.yearly)/pm;
    },0);
    const periodNet=periodGross-periodPreTax;
    const preLabel=linked.length?` <span class="muted" style="font-size:.78rem">−${fmt$(periodPreTax)} pre-tax</span>`:'';
    recentItems.push({date:itemDate,desc:esc(r.name)+preLabel,cat:'Income',catCls:'euc',amt:periodNet,sign:1});
  });
  (b.expenses||[]).forEach(e=>{if(e.date)recentItems.push({date:e.date,desc:esc(e.name||e.description||'Expense'),cat:esc(e.category||'Expense'),catCls:'red',amt:num(e.amount),sign:-1});});
  (b.dividends||[]).forEach(d=>{if(d.date)recentItems.push({date:d.date,desc:`${esc(d.code)} dividend`,cat:'Dividend',catCls:'euc',amt:num(d.payment),sign:1});});
  recentItems.sort((a,b2)=>b2.date<a.date?-1:1);
  const shown=recentItems.slice(0,8);
  const recentHTML=shown.length
    ?`<div style="overflow-x:auto"><table class="tbl"><thead><tr>
        <th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th>
      </tr></thead><tbody>
      ${shown.map(it=>`<tr>
        <td style="color:var(--muted);font-size:var(--text-sm);white-space:nowrap">${fmtDate(it.date)}</td>
        <td>${it.desc}</td>
        <td><span class="badge ${it.catCls}">${it.cat}</span></td>
        <td class="num" style="font-weight:var(--fw-semibold);color:var(--${it.sign>0?'euc':'red'})">${it.sign>0?'':'-'}${fmt$(Math.abs(it.amt))}</td>
      </tr>`).join('')}
      </tbody></table></div>`
    :`<div class="muted" style="padding:10px 0">No entries yet — <a href="#" onclick="go('income');return false">add income</a> or <a href="#" onclick="go('expenses');return false">expenses</a> to see them here.</div>`;
  m.insertAdjacentHTML('beforeend',`<div class="card">
    <div class="chead"><h2>Recent activity</h2>
      <div style="display:flex;gap:8px">
        <button class="btn small" onclick="go('income')">Income ↗</button>
        <button class="btn small" onclick="go('expenses')">Expenses ↗</button>
      </div>
    </div>
    <div class="cbody tight">${recentHTML}</div>
  </div>`);

  // ── Tax detail strip ──
  m.insertAdjacentHTML('beforeend',`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px">
    <div class="stat good" style="cursor:pointer" onclick="go('income')" title="Go to income">
      <div class="l">Assessable income</div><div class="v">${fmt$0(s.assessable)}</div>
      <div class="d">salary ${fmt$0(incTot)}${divTot?` · dividends ${fmt$0(divTot)}`:''}${rentalTot?` · rental ${fmt$0(rentalTot)}`:''}</div>
    </div>
    <div class="stat bad" style="cursor:pointer" onclick="go('other')" title="Go to deductions">
      <div class="l">Deductions tracked</div><div class="v">${fmt$0(s.deductions)}</div>
      <div class="d">WFH ${fmt$(s.wfh.claim)} · ${wfhStats.days} days</div>
    </div>
    <div class="stat gold" style="cursor:pointer" onclick="go('summary')" title="Go to FY summary">
      <div class="l">Est. tax payable</div><div class="v">${fmt$0(s.tax.total)}</div>
      <div class="d">effective rate ${pct(s.effRate)} · ${s.balance>=0?'refund est.':'owing'} ${fmt$0(Math.abs(s.balance))}</div>
    </div>
  </div>
  <div class="note" style="margin-top:14px">Tax figures are estimates from the rate snapshot for ${esc(fyDisplay(y))}. Verify against the ATO before lodging — this is not tax advice.</div>`);
};
function dashboardHousehold(m,y){
  const per=DB.people.map(pp=>{
    const b2=bucket(y,pp.id);
    const s=fySummaryNumbers(y,pp.id);
    const incYr=cashIncomeYearly(b2,pp.id,y);
    const expYr=(b2.expenses||[]).reduce((sm,e)=>sm+yearlyFromRec(num(e.amount),e.recurrence),0)+b2.property.expenses.reduce((sm,e)=>sm+num(e.amount),0);
    const excess=(s.assessable-s.tax.total)-expYr;
    return{p:pp,b:b2,s,incYr,expYr,excess};
  });
  const sum=k=>per.reduce((s,x)=>s+(k.split('.').reduce((o,kk)=>o[kk],x.s)),0);
  const assess=sum('assessable'),ded=sum('deductions'),tax=sum('tax.total'),bal=sum('balance');
  const net=assess-tax;
  head(m,'Household dashboard',`${y.label} · how you're tracking together`,'');
  m.insertAdjacentHTML('beforeend',`
  <div class="grid3">
    <div class="stat good"><div class="l">Combined assessable income</div><div class="v">${fmt$0(assess)}</div><div class="d">${DB.people.length} people</div></div>
    <div class="stat gold"><div class="l">Combined tax payable</div><div class="v">${fmt$0(tax)}</div><div class="d">deductions ${fmt$0(ded)}</div></div>
    <div class="stat ${bal>=0?'good':'bad'}"><div class="l">${bal>=0?'Combined refund estimate':'Combined amount owing'}</div><div class="v">${fmt$0(Math.abs(bal))}</div><div class="d">net after tax ${fmt$0(net)}</div></div>
  </div>
  <div class="grid3">
    <div class="card"><div class="chead"><h2>Income split</h2></div><div class="cbody">
      ${pieChartSVG(per.map(x=>({label:x.p.name,value:x.incYr,color:x.p.color})),{aria:'Income split by person',center:fmt$0(sum2(per,'incYr')),centerSub:'total income'})}
    </div></div>
    <div class="card"><div class="chead"><h2>Expenses split</h2></div><div class="cbody">
      ${pieChartSVG(per.map(x=>({label:x.p.name,value:x.expYr,color:x.p.color})),{aria:'Expenses split by person',center:fmt$0(sum2(per,'expYr')),centerSub:'total expenses'})}
    </div></div>
    <div class="card"><div class="chead"><h2>Excess income split</h2></div><div class="cbody">
      ${per.every(x=>x.excess>0)?pieChartSVG(per.map(x=>({label:x.p.name,value:x.excess,color:x.p.color})),{aria:'Excess income split by person',center:fmt$0(sum2(per,'excess')),centerSub:'total surplus'})
        :`<div class="muted" style="margin-bottom:8px">Excess income (after-tax income minus expenses) — shown as a list since at least one person has a shortfall, which a pie chart can't represent:</div>
          ${per.map(x=>`<div class="kv"><span class="k">${pdot(x.p)} ${esc(x.p.name)}</span><span class="v" style="color:${x.excess>=0?'var(--euc)':'var(--red)'}">${fmt$0(x.excess)}${x.excess<0?' shortfall':''}</span></div>`).join('')}
          <div class="kv big mt"><span class="k">Combined</span><span class="v" style="color:${sum2(per,'excess')>=0?'var(--euc)':'var(--red)'}">${fmt$0(sum2(per,'excess'))}</span></div>`}
    </div></div>
  </div>
  <div class="grid2">
    ${per.map(({p,s,incYr,expYr,excess})=>`<div class="card"><div class="chead"><h2>${pdot(p)} ${esc(p.name)}</h2>
      <button class="btn small" onclick="setPerson('${p.id}')">Open</button></div><div class="cbody">
      <div class="kv"><span class="k">Assessable income</span><span class="v">${fmt$(s.assessable)}</span></div>
      <div class="kv"><span class="k">Deductions</span><span class="v">${fmt$(-s.deductions)}</span></div>
      <div class="kv"><span class="k">Tax payable</span><span class="v" style="color:var(--red)">${fmt$(-s.tax.total)}</span></div>
      <div class="kv big"><span class="k">${s.balance>=0?'Refund estimate':'Amount owing'}</span><span class="v" style="color:${s.balance>=0?'var(--euc)':'var(--red)'}">${fmt$(Math.abs(s.balance))}</span></div>
      <div class="kv"><span class="k">WFH days · claim</span><span class="v">${s.wfh.days} · ${fmt$(s.wfh.claim)}</span></div>
      <div class="kv"><span class="k">Expenses / yr</span><span class="v">${fmt$0(expYr)}</span></div>
      <div class="kv"><span class="k">Excess after expenses</span><span class="v" style="color:${excess>=0?'var(--euc)':'var(--red)'}">${fmt$0(excess)}</span></div>
    </div></div>`).join('')}
  </div>`);

  // Upcoming novated lease events — across all household members.
  const hhLeases=[];
  const hhSeen=new Set();
  const hhToday=todayISO();
  DB.people.forEach(pp=>{
    Object.values(DB.years).forEach(fy=>{
      (bucket(fy,pp.id).preTaxDeds||[]).forEach(r=>{
        if(r.type!=='Novated lease'||hhSeen.has(r.id))return;
        const end=leaseEndDate(r);if(!end)return;
        const diffDays=Math.round((new Date(end+'T00:00:00Z')-Date.now())/86400000);
        if(diffDays>-30&&diffDays<400){hhSeen.add(r.id);hhLeases.push({r,end,diffDays,pp,veh:r.vehicleId?DB.assets.find(a=>a.id===r.vehicleId):null});}
      });
    });
  });
  if(hhLeases.length){
    const hhLeaseRows=hhLeases.sort((a,b)=>a.end<b.end?-1:1).map(({r,end,diffDays,pp,veh})=>{
      const expired=diffDays<0,soonish=diffDays<90;
      const color=expired?'var(--red)':soonish?'var(--gold)':'var(--muted)';
      return `<div class="kv"><span class="k"><b style="color:${color}">${esc(r.name)}</b>${veh?' · 🚗 '+esc(veh.name):''} ${pdot(pp)} ${esc(pp.name)}</span>
        <span class="v" style="color:${color}">${expired?'⚠ expired · ':''}${fmtDate(end)} (${leaseCountdown(end)})${r.residualAmount?` · residual <b>${fmt$0(r.residualAmount)}</b>`:''}</span></div>`;
    }).join('');
    m.insertAdjacentHTML('beforeend',`<div class="card" style="border-color:var(--gold)"><div class="chead"><h2>🗓 Novated lease${hhLeases.length>1?'s':''} expiring</h2></div><div class="cbody">${hhLeaseRows}</div></div>`);
  }

  // Household monthly cashflow — sums every person's income/expenses per month
  const incomeMo=new Array(12).fill(0),expMo=new Array(12).fill(0);
  per.forEach(({b:b2,p:p2})=>{
    incomeMonthlyForFY(b2,p2.id).forEach((v,i)=>incomeMo[i]+=v);
    expensesMonthlyForFY(b2).forEach((v,i)=>expMo[i]+=v);
  });
  const cashData=FY_MONTHS.map((label,i)=>({label,value:incomeMo[i]||0,value2:expMo[i]||0}));
  const totalInc=sum2(per,'incYr'),totalExp=sum2(per,'expYr'),surplus=totalInc-totalExp;
  m.insertAdjacentHTML('beforeend',`
  <div class="card"><div class="chead"><h2>Household monthly cashflow — ${esc(fyDisplay(y))}</h2>
    <span class="actions">${totalExp?`<span class="hint">${fmt$0(totalInc)}/yr income · ${fmt$0(totalExp)}/yr expenses · <span style="color:${surplus>=0?'var(--euc)':'var(--red)'}">${surplus>=0?'▲':'▼'} ${fmt$0(Math.abs(surplus))} ${surplus>=0?'surplus':'shortfall'}</span></span>`:'<span class="hint muted">Add expenses to see cashflow</span>'}</span></div>
    <div class="cbody">${barChartSVG(cashData,{aria:'Household monthly cashflow — income vs expenses',label2:'Expenses'})}
    <div style="display:flex;gap:16px;font-size:.8rem;margin-top:6px">
      <span><span style="display:inline-block;width:12px;height:12px;background:var(--euc);border-radius:3px;margin-right:5px;vertical-align:-2px"></span>Income</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:var(--gold);border-radius:3px;margin-right:5px;vertical-align:-2px"></span>Expenses</span>
    </div>
  </div></div>
  <div class="card"><div class="chead"><h2>Where to next</h2></div><div class="cbody"><div class="grid3">
    <button class="btn" onclick="go('budget')">Household budgets</button>
    <button class="btn" onclick="go('summary')">Combined FY summary</button>
    <button class="btn" onclick="go('networth')">Combined net worth</button>
  </div></div></div>`);
}
function sum2(arr,k){return arr.reduce((s,x)=>s+(num(x[k])||0),0);}

/* ================= SALARY / PAY CALCULATOR =================
   A standalone "what would my take-home pay be" tool on the Budget Planner
   page — gross↔net conversion, marginal vs effective rate, a side-by-side
   pay-frequency breakdown, and an optional two-scenario comparison (e.g.
   "current salary" vs "job offer"). Transient UI state, not synced to Drive. */
let PAYCALC_OPEN=false;
const PAYCALC_FREQS=['yearly','monthly','fortnightly','weekly'];
const PAYCALC_FREQ_LABEL={yearly:'Yearly',monthly:'Monthly',fortnightly:'Fortnightly',weekly:'Weekly'};
function payCalcDefaultScenario(amount){return{mode:'gross',amount,freq:'yearly',medicare:true,mls:false,hasCover:true};}
let PAYCALC={compare:false,a:payCalcDefaultScenario(90000),b:payCalcDefaultScenario(100000)};
/* Binary search for the gross income that produces a given net (take-home)
   income — fullTax() is monotonic in taxable income so this converges
   quickly. Doubles the upper bound until it's known to bracket the answer,
   which keeps this correct even for very high net targets. */
function payCalcSolveGross(net,R,opt){
  if(net<=0)return 0;
  let lo=0,hi=Math.max(net*1.6,1000);
  while(hi-fullTax(hi,R,opt).total<net&&hi<5e7)hi*=2;
  for(let i=0;i<60;i++){
    const mid=(lo+hi)/2;
    if(mid-fullTax(mid,R,opt).total<net)lo=mid;else hi=mid;
  }
  return(lo+hi)/2;
}
/* Computes gross, net, the full tax breakdown, and the marginal rate (the
   tax rate on the NEXT dollar — combines bracket rate, Medicare shade-in,
   LITO taper and MLS all at once via a $1 finite difference) for a scenario. */
function payCalcCompute(s,R){
  const yearly=num(s.amount)*(REC_MULT[s.freq]||1);
  const opt={medicare:s.medicare,mls:s.mls,hasCover:s.hasCover};
  const gross=s.mode==='gross'?yearly:payCalcSolveGross(yearly,R,opt);
  const t=fullTax(gross,R,opt);
  const net=gross-t.total;
  const marginal=(fullTax(gross+1,R,opt).total-t.total)*100;
  const effective=gross>0?t.total/gross*100:0;
  return{gross,net,tax:t,marginal,effective};
}
/* Splits the marginal rate into its contributing components (bracket,
   Medicare, LITO taper-out, MLS) using the same $1 finite-difference
   technique as the overall marginal rate — so the parts always sum back
   to the total exactly, and a counterintuitively-high marginal rate (e.g.
   from LITO phasing out) is visible at a glance rather than looking wrong. */
function payCalcMarginalBreakdown(gross,R,opt){
  const t0=fullTax(gross,R,opt),t1=fullTax(gross+1,R,opt);
  const fmtPart=v=>{const r=Math.round(v*1000)/10;return Math.round(r*10)/10;}; // cents -> % to 1dp
  const bracket=fmtPart(t1.base-t0.base);
  const lito=fmtPart(t0.lito-t1.lito); // LITO shrinking as income rises = extra effective tax
  const medicare=fmtPart(t1.medicare-t0.medicare);
  const mls=fmtPart(t1.mls-t0.mls);
  const parts=[];
  if(bracket>0.04)parts.push(`${bracket}% bracket`);
  if(medicare>0.04)parts.push(`${medicare}% Medicare`);
  if(lito>0.04)parts.push(`${lito}% LITO`);
  if(mls>0.04)parts.push(`${mls}% MLS`);
  return parts.join(' + ');
}
function payCalcToggle(){PAYCALC_OPEN=!PAYCALC_OPEN;render();}
function payCalcSet(key,field,val){
  PAYCALC[key][field]=val;
  render();
}
function payCalcInputs(key,label){
  const s=PAYCALC[key];
  return `<div class="card" style="flex:1;min-width:260px"><div class="chead"><h2>${esc(label)}</h2></div><div class="cbody">
    <div class="fldrow">
      <div><label class="fld">I know my</label><select class="input" onchange="payCalcSet('${key}','mode',this.value)">
        <option value="gross" ${s.mode==='gross'?'selected':''}>Gross (before tax)</option>
        <option value="net" ${s.mode==='net'?'selected':''}>Net (take-home)</option>
      </select></div>
      <div><label class="fld">Amount ($)</label><input class="input money" value="${s.amount}" onchange="payCalcSet('${key}','amount',num(this.value))"></div>
      <div><label class="fld">Per</label><select class="input" onchange="payCalcSet('${key}','freq',this.value)">
        ${PAYCALC_FREQS.map(f=>`<option value="${f}" ${s.freq===f?'selected':''}>${PAYCALC_FREQ_LABEL[f]}</option>`).join('')}
      </select></div>
    </div>
    <div class="fldrow mt" style="flex-wrap:wrap;gap:14px">
      <label style="display:flex;align-items:center;gap:6px;font-size:.84rem"><input type="checkbox" ${s.medicare?'checked':''} onchange="payCalcSet('${key}','medicare',this.checked)"> Medicare levy</label>
      <label style="display:flex;align-items:center;gap:6px;font-size:.84rem"><input type="checkbox" ${s.mls?'checked':''} onchange="payCalcSet('${key}','mls',this.checked)"> Subject to MLS</label>
      ${s.mls?`<label style="display:flex;align-items:center;gap:6px;font-size:.84rem"><input type="checkbox" ${s.hasCover?'checked':''} onchange="payCalcSet('${key}','hasCover',this.checked)"> Have private hospital cover</label>`:''}
    </div>
  </div></div>`;
}
function payCalcResults(key,label,R){
  const s=PAYCALC[key],r=payCalcCompute(s,R);
  const rows=[
    ['Gross income',r.gross,''],
    ['Income tax',-r.tax.base,r.tax.lito?`offset by ${fmt$0(r.tax.lito)} LITO`:''],
    ['Medicare levy'+(r.tax.mls?' + MLS':''),-(r.tax.medicare+r.tax.mls),''],
    ['Net (take-home)',r.net,'']
  ];
  const table=`<table class="tbl"><thead><tr><th></th>${PAYCALC_FREQS.map(f=>`<th class="num">${PAYCALC_FREQ_LABEL[f]}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(([rlabel,val,sub])=>`<tr${rlabel==='Net (take-home)'?' class="total"':''}><td>${esc(rlabel)}${sub?`<div class="muted" style="font-size:.72rem">${esc(sub)}</div>`:''}</td>
      ${PAYCALC_FREQS.map(f=>`<td class="num">${fmt$(val/(REC_MULT[f]||1))}</td>`).join('')}</tr>`).join('')}
  </tbody></table>`;
  // The marginal rate looks "too high" relative to the bracket rate when
  // taxable income sits in the LITO phase-out band ($45,001 to roughly
  // $66,667) — every extra dollar earned there both gets taxed at the
  // bracket rate AND costs you 1.5c of LITO entitlement, on top of the
  // 2% Medicare levy. That's correct ATO behaviour, not a bug — flag it
  // so it doesn't look like one.
  const inLitoTaper=R.lito&&r.gross>R.lito.t2&&litoOffset(r.gross,R)>0;
  const marginalBreakdown=payCalcMarginalBreakdown(r.gross,R,{medicare:s.medicare,mls:s.mls,hasCover:s.hasCover});
  return{r,html:`<div class="card" style="flex:1;min-width:260px"><div class="chead"><h2>${esc(label)} — results</h2></div><div class="cbody tight">
    <div class="grid2" style="padding:14px 14px 0">
      <div class="stat"><div class="l">Effective tax rate</div><div class="v">${pct(r.effective)}</div><div class="d">total tax ÷ gross</div></div>
      <div class="stat gold"><div class="l">Marginal tax rate</div><div class="v">${pct(r.marginal)}</div><div class="d">${esc(marginalBreakdown)}${inLitoTaper?` <span title="Between roughly $45,001 and $66,667 taxable income, the Low Income Tax Offset phases out at 1.5c per dollar on top of your bracket rate and Medicare levy — this is correct, not a bug">ℹ️</span>`:''}</div></div>
    </div>
    <div style="padding:14px">${table}</div>
  </div></div>`};
}
function payCalcCard(){
  const y=FY(),R=y.rates;
  if(!PAYCALC_OPEN){
    return `<div class="card"><div class="cbody" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div><b>🧮 Salary calculator</b> <span class="muted">— gross ↔ net, marginal rate, pay-frequency breakdown, and job-offer comparison</span></div>
      <button class="btn small" onclick="payCalcToggle()">Open</button>
    </div></div>`;
  }
  const resA=payCalcResults('a','Scenario A',R);
  let body=`<div style="display:flex;gap:14px;flex-wrap:wrap">${payCalcInputs('a','Scenario A')}${resA.html}</div>`;
  if(PAYCALC.compare){
    const resB=payCalcResults('b','Scenario B',R);
    body+=`<div class="mt" style="display:flex;gap:14px;flex-wrap:wrap">${payCalcInputs('b','Scenario B')}${resB.html}</div>`;
    const dNet=resB.r.net-resA.r.net,dGross=resB.r.gross-resA.r.gross;
    const dNetPct=resA.r.net>0?dNet/resA.r.net*100:0,dGrossPct=resA.r.gross>0?dGross/resA.r.gross*100:0;
    body+=`<div class="card mt"><div class="chead"><h2>Difference — B vs A</h2></div><div class="cbody">
      <div class="grid3">
        <div class="stat ${dGross>=0?'good':'bad'}"><div class="l">Gross / yr</div><div class="v">${dGross>=0?'+':'−'}${fmt$0(Math.abs(dGross))}</div><div class="d">${dGross>=0?'+':'−'}${Math.abs(dGrossPct).toFixed(1)}%</div></div>
        <div class="stat ${dNet>=0?'good':'bad'}"><div class="l">Net / yr</div><div class="v">${dNet>=0?'+':'−'}${fmt$0(Math.abs(dNet))}</div><div class="d">${dNet>=0?'+':'−'}${Math.abs(dNetPct).toFixed(1)}% · ${dNet>=0?'+':'−'}${fmt$0(Math.abs(dNet)/12)}/mo · ${dNet>=0?'+':'−'}${fmt$0(Math.abs(dNet)/52)}/wk</div></div>
        <div class="stat"><div class="l">Marginal rate</div><div class="v">${pct(resA.r.marginal)} → ${pct(resB.r.marginal)}</div><div class="d">effective ${pct(resA.r.effective)} → ${pct(resB.r.effective)}</div></div>
      </div>
    </div></div>`;
  }
  return `<div class="card"><div class="chead"><h2>🧮 Salary calculator <span class="muted" style="font-size:.78rem;font-weight:400">using ${esc(fyDisplay(y))} rates</span></h2>
      <span class="actions">
        <label style="display:flex;align-items:center;gap:6px;font-size:.84rem;font-weight:400"><input type="checkbox" ${PAYCALC.compare?'checked':''} onchange="PAYCALC.compare=this.checked;render()"> Compare two scenarios</label>
        <button class="btn ghost small" onclick="payCalcToggle()">✕ Close</button>
      </span></div>
    <div class="cbody">${body}
    <div class="note mt">Uses the ${esc(fyDisplay(y))} rate snapshot — switch financial years with the selector at the top of the page to compare under a different year's rates. Assumes the amount entered is your <b>only</b> taxable income (no other deductions) — for your actual position including all income/deductions, see the FY summary. HECS/HELP repayments aren't included yet.</div>
  </div></div>`;
}
/* ================= BUDGETS — saved per FY (historical) ================= */
let BUD_OPEN=null; // id of the budget being edited, transient
const BUD_PER_MULT={w:52,m:12,b:2,y:1};
const yrOf=r=>num(r.amt)*(BUD_PER_MULT[r.per]||12);
function budList(){return FY().budgets=FY().budgets||[];}
function budGet(id){return budList().find(b=>b.id===id);}
function budScopeLabel(b){return b.scope==='all'?(b.isCombined?'⌂ Household (combined)':'⌂ Household'):(pdot(person(b.scope))+' '+esc(person(b.scope).name));}
function defaultOpts(){return{medicare:true,mls:false,hasCover:true};}
/* For a "combined" household budget, incomes/deds aren't stored on the
   budget itself — they're read live from each person's selected individual
   budget (b.sources={pid:budgetId}), tagged with that person's pid. This
   means edits to the individual budgets are reflected here automatically.
   For a normal budget, just returns its own list. */
function budSourceList(b,kind){
  if(!b.isCombined)return b[kind]||[];
  let out=[];
  Object.keys(b.sources||{}).forEach(pid=>{
    const src=budGet(b.sources[pid]);
    if(src)out=out.concat((src[kind]||[]).map(r=>({...r,pid:r.pid||pid})));
  });
  return out;
}

/* ---- Combined household budget: pick at most one individual budget per
   person; incomes/deds/levies are then read live from those budgets
   (see budSourceList). Re-opening this lets you change the selection. ---- */
function budCombinedOpen(existingId){
  const editing=existingId?budGet(existingId):null;
  const rows=DB.people.map(p=>{
    const opts=budList().filter(bd=>bd.scope===p.id&&!bd.isCombined);
    const cur=editing?(editing.sources||{})[p.id]||'':'';
    return `<div class="fldrow" style="margin-bottom:6px;align-items:center"><div style="flex:1;font-size:.86rem">${pdot(p)} ${esc(p.name)}</div>
      <div style="flex:2"><select class="input combined-src-sel" data-pid="${p.id}">
        <option value="">— none —</option>
        ${opts.map(bd=>`<option value="${bd.id}" ${cur===bd.id?'selected':''}>${esc(bd.name)}</option>`).join('')}
      </select></div></div>`;
  }).join('');
  const noneYet=DB.people.every(p=>!budList().some(bd=>bd.scope===p.id&&!bd.isCombined));
  modal(editing?'Change combined budget sources':'Create combined budget',`
    ${editing?'':`<label class="fld">Name</label><input id="f_n" class="input" value="Combined household budget" style="margin-bottom:10px">`}
    <div class="note" style="margin-bottom:8px">Pick at most one individual budget per person. This view stays live — when those budgets are edited, the combined totals update automatically. Post-tax expenses are set separately on the combined budget itself.</div>
    ${rows}
    ${noneYet?'<div class="hint mt">No individual budgets exist yet — create one for each person first, then come back here.</div>':''}`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="budCombinedSave(${existingId?`'${existingId}'`:'null'})">${editing?'Save':'Create'}</button>`);
}
function budCombinedSave(existingId){
  const sources={};
  $$('.combined-src-sel').forEach(sel=>{if(sel.value)sources[sel.dataset.pid]=sel.value;});
  if(existingId){
    const b=budGet(existingId);if(!b)return;
    b.sources=sources;save();closeModal();render();return;
  }
  const b={id:uid(),name:$('#f_n').value.trim()||'Combined household budget',scope:'all',isCombined:true,createdAt:todayISO(),
    sources,exps:[{name:'Rent / mortgage',amt:0,per:'m'}],opts:{},allocations:[]};
  budList().push(b);save();closeModal();BUD_OPEN=b.id;render();
}
/* ---- Compare two budgets side by side ---- */
let BUD_COMPARE=null; // {a:budgetId,b:budgetId} while comparing, transient
function budgetCompare(m,y){
  head(m,'Compare budgets',`Pick two budgets saved in ${esc(fyDisplay(y))} to compare side by side.`,
    `<button class="btn" onclick="BUD_COMPARE=null;render()">← All budgets</button>`);
  const vis=budList();
  const opt=(sel)=>`<option value="">— pick a budget —</option>`+vis.map(bd=>`<option value="${bd.id}" ${sel===bd.id?'selected':''}>${esc(bd.name)} — ${budScopeLabel(bd)}</option>`).join('');
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="cbody"><div class="fldrow">
    <div><label class="fld">Budget A</label><select class="input" onchange="BUD_COMPARE.a=this.value;render()">${opt(BUD_COMPARE.a)}</select></div>
    <div><label class="fld">Budget B</label><select class="input" onchange="BUD_COMPARE.b=this.value;render()">${opt(BUD_COMPARE.b)}</select></div>
  </div></div></div>`);
  const A=BUD_COMPARE.a&&budGet(BUD_COMPARE.a),B=BUD_COMPARE.b&&budGet(BUD_COMPARE.b);
  if(!A||!B){m.insertAdjacentHTML('beforeend','<div class="note">Pick two budgets above to compare.</div>');return;}
  const rA=budTotals(y,A),rB=budTotals(y,B);
  const ded=r=>Object.values(r.perP).reduce((s,x)=>s+x.deds,0);
  const taxable=r=>Object.values(r.perP).reduce((s,x)=>s+x.taxable,0);
  const diffCell=(a,b2)=>{const d=b2-a;return `<td class="num" style="color:${d>0?'var(--euc)':d<0?'var(--red)':'inherit'}">${d===0?'—':(d>0?'+':'')+fmt$(d)}</td>`;};
  const row=(label,a,b2,opts={})=>`<tr class="${opts.tot?'total':''}"><td>${label}</td><td class="num">${fmt$(a)}</td><td class="num">${fmt$(b2)}</td>${diffCell(a,b2)}</tr>`;
  const summary=row('Gross income / yr',rA.gross,rB.gross)
    +row('Pre-tax deductions / yr',ded(rA),ded(rB))
    +row('Taxable income / yr',taxable(rA),taxable(rB))
    +row('Tax payable / yr',rA.tax,rB.tax)
    +row('Net income / yr',rA.net,rB.net)
    +row('Post-tax expenses / yr',rA.exps,rB.exps)
    +row('Excess cash / yr',rA.excess,rB.excess,{tot:1});
  // Line-item comparison: union of names within each category, side by side.
  const lineTable=(title,listA,listB)=>{
    const names=[...new Set([...listA.map(r=>r.name||'—'),...listB.map(r=>r.name||'—')])];
    if(!names.length)return '';
    const sumBy=(list,name)=>list.filter(r=>(r.name||'—')===name).reduce((s,r)=>s+yrOf(r),0);
    const rows=names.map(n=>row(esc(n),sumBy(listA,n),sumBy(listB,n))).join('');
    return `<div class="card"><div class="chead"><h2>${title}</h2></div><div class="cbody tight"><table class="tbl">
      <thead><tr><th></th><th class="num">${esc(A.name)}</th><th class="num">${esc(B.name)}</th><th class="num">Difference</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  };
  m.insertAdjacentHTML('beforeend',`
  <div class="card"><div class="chead"><h2>Summary</h2><span class="hint">${esc(A.name)} (${budScopeLabel(A)}) vs ${esc(B.name)} (${budScopeLabel(B)})</span></div>
  <div class="cbody tight"><table class="tbl">
    <thead><tr><th></th><th class="num">${esc(A.name)}</th><th class="num">${esc(B.name)}</th><th class="num">Difference</th></tr></thead>
    <tbody>${summary}</tbody></table></div></div>
  ${lineTable('Income',budSourceList(A,'incomes'),budSourceList(B,'incomes'))}
  ${lineTable('Pre-tax deductions',budSourceList(A,'deds'),budSourceList(B,'deds'))}
  ${lineTable('Post-tax expenses',A.exps||[],B.exps||[])}`);
}
PAGES.budget=m=>{
  const y=FY();
  const open=BUD_OPEN&&budGet(BUD_OPEN);
  if(open)return budgetEditor(m,y,open);
  if(BUD_COMPARE)return budgetCompare(m,y);
  const vis=budList().filter(b=>isAll()?true:(b.scope===DB.currentPid||b.scope==='all'));
  head(m,'Budgets',`Budgets are saved inside <b>${esc(fyDisplay(y))}</b>, so past years keep their history. Switch financial year in the sidebar to look back.`,
    `${vis.length>=2?`<button class="btn" onclick="BUD_COMPARE={};render()">⇄ Compare</button>`:''}
     ${isAll()&&DB.people.length>1?`<button class="btn" onclick="budCombinedOpen()">+ Create combined budget</button>`:''}
     <button class="btn" onclick="budFromFY()">📥 Create from FY data</button>
     <button class="btn primary" onclick="budNew()">+ New budget</button>`);
  m.insertAdjacentHTML('beforeend',payCalcCard());
  const rows=vis.map(b=>{
    const r=budTotals(y,b);
    return `<tr><td><a href="#" onclick="BUD_OPEN='${b.id}';render();return false"><b>${b.isCombined?'🔗 ':''}${esc(b.name)}</b></a></td>
    <td>${budScopeLabel(b)}</td>
    <td class="num">${fmt$0(r.gross)}</td><td class="num" style="color:var(--red)">${fmt$0(r.tax)}</td>
    <td class="num">${fmt$0(r.net)}</td><td class="num" style="color:${r.excess>=0?'var(--euc)':'var(--red)'}">${fmt$0(r.excess)}</td>
    <td class="rowact"><button class="btn ghost small" onclick="BUD_OPEN='${b.id}';render()">Open</button>
      <button class="btn ghost small" onclick="budDup('${b.id}')">Duplicate</button>
      <button class="btn ghost small" onclick="if(!lockedGuard())confirmDel('Delete budget ${esc(b.name)}?',()=>{const L=budList();L.splice(L.findIndex(x=>x.id==='${b.id}'),1);save();render()})">✕</button></td></tr>`;
  }).join('');
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="cbody tight"><table class="tbl">
    <thead><tr><th>Budget</th><th>For</th><th class="num">Gross / yr</th><th class="num">Tax</th><th class="num">Net</th><th class="num">Excess cash</th><th></th></tr></thead>
    <tbody>${rows||`<tr><td colspan="7" class="muted">No budgets in ${esc(fyDisplay(y))} yet — create one for yourself${DB.people.length>1?', your partner, or the whole household':''}.</td></tr>`}</tbody></table></div></div>
  <div class="note">Tax in each budget is worked out on <b>taxable</b> income (gross − pre-tax deductions) per person, using the ${esc(fyDisplay(y))} rate snapshot. Household budgets assign each income to a person, since Australian tax is individual.</div>`);
};
function budNew(){
  if(lockedGuard())return;
  const opts=DB.people.map(p=>`<option value="${p.id}" ${DB.currentPid===p.id?'selected':''}>${esc(p.name)}</option>`).join('')
    +(DB.people.length>1?`<option value="all" ${isAll()?'selected':''}>⌂ Household (everyone)</option>`:'');
  const perPersonImport=DB.people.length>1?`<div id="importSection" style="display:none;margin-top:12px">
      <div class="note" style="margin-bottom:8px">Import rows from existing individual budgets (optional):</div>
      ${DB.people.map(p=>`<div class="fldrow" style="margin-bottom:6px"><div style="flex:1;font-size:.86rem;padding-top:8px">${pdot(p)} ${esc(p.name)}</div>
        <div style="flex:2"><select class="input bud-import-sel" data-pid="${p.id}"><option value="">— nothing —</option>
          ${(FY().budgets||[]).filter(b=>b.scope===p.id).map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div></div>`).join('')}
    </div>`:'';
  modal('New budget',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Name</label><input id="f_n" class="input" placeholder="e.g. 2026 baseline, After pay rise, Tight mode"></div>
    <div><label class="fld">For</label><select id="f_s" class="input" onchange="$('#importSection').style.display=this.value==='all'&&${DB.people.length>1?1:0}?'block':'none'">${opts}</select></div></div>
    ${perPersonImport}`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="budCreate()">Create</button>`);
}
function budCreate(){
  const scope=$('#f_s').value;
  // Import rows from individual budgets if requested
  if(scope==='all'){
    const imports={};
    $$('.bud-import-sel').forEach(sel=>{if(sel.value)imports[sel.dataset.pid]=sel.value;});
    const scope2=$('#f_s').value;
    const b={id:uid(),name:$('#f_n').value.trim()||'Budget',scope:scope2,createdAt:todayISO(),
      incomes:[],deds:[],exps:[],opts:{},allocations:[]};
    const pids=DB.people.map(p=>p.id);
    pids.forEach(pid=>{b.opts[pid]=defaultOpts();});
    Object.entries(imports).forEach(([pid,bid])=>{
      const src2=budList().find(x=>x.id===bid);if(!src2)return;
      src2.incomes.forEach(r=>{b.incomes.push({...r,id:uid(),pid});});
      src2.deds.forEach(r=>{b.deds.push({...r,id:uid(),pid});});
      if(!b.exps.length)src2.exps.forEach(r=>{b.exps.push({...r,id:uid()});});
      if(src2.opts[pid])b.opts[pid]={...src2.opts[pid]};
    });
    if(!b.incomes.length)pids.forEach(pid=>{b.incomes.push({name:'Salary',amt:0,per:'m',pid});});
    if(!b.exps.length)b.exps.push({name:'Rent / mortgage',amt:0,per:'m'});
    if(!b.deds.length)budPrefillDeds(b,pids);
    budList().push(b);save();closeModal();BUD_OPEN=b.id;render();return;
  }
  const b={id:uid(),name:$('#f_n').value.trim()||'Budget',scope,createdAt:todayISO(),
    incomes:[],deds:[],exps:[],opts:{}};
  const pids=scope==='all'?DB.people.map(p=>p.id):[scope];
  pids.forEach(pid=>{b.opts[pid]=defaultOpts();b.incomes.push({name:'Salary',amt:0,per:'m',pid});});
  b.exps.push({name:'Rent / mortgage',amt:0,per:'m'});
  budPrefillDeds(b,pids);
  budList().push(b);save();closeModal();BUD_OPEN=b.id;render();
}
/* Pre-populate a new budget's "Pre-tax deductions" rows from each person's
   actual salary-sacrifice entries (Income page → Pre-tax deductions),
   so the budget starts in sync with what's really being deducted —
   editable from there. */
function budFromFY(){
  if(lockedGuard())return;
  const y=FY();
  const scope=isAll()?'all':DB.currentPid;
  const pids=scope==='all'?DB.people.map(p=>p.id):[DB.currentPid];
  const name=`${fyDisplay(y)} actual`;
  const b={id:uid(),name,scope,createdAt:todayISO(),incomes:[],deds:[],exps:[],opts:{},allocations:[]};
  pids.forEach(pid=>{
    b.opts[pid]=defaultOpts();
    const bkt=bucket(y,pid);
    // Income rows
    (bkt.incomes||[]).forEach(r=>{
      b.incomes.push({id:uid(),name:r.name,amt:num(r.yearly),per:'y',pid});
    });
    // Pre-tax deductions
    (bkt.preTaxDeds||[]).forEach(r=>{
      b.deds.push({id:uid(),name:r.name,amt:num(r.yearly),per:'y',pid});
    });
    // WFH, property deductions as pre-tax line items
    const bd=fyTaxableBreakdown(y,pid);
    if(bd.wfh?.claim)b.deds.push({id:uid(),name:'WFH deduction (estimated)',amt:round2(bd.wfh.claim),per:'y',pid});
    if(bd.prop)b.deds.push({id:uid(),name:'Investment/vehicle expense deductions (estimated)',amt:round2(bd.prop),per:'y',pid});
    // Post-tax expenses — from the expenses page, grouped by expense category
    const expCats={};
    (bkt.expenses||[]).forEach(e=>{
      const cat=e.category||'Other';
      expCats[cat]=(expCats[cat]||0)+num(e.amount);
    });
    Object.entries(expCats).forEach(([cat,amt])=>{
      if(amt>0)b.exps.push({id:uid(),name:cat,amt:round2(amt),per:'y'});
    });
    // Property expenses as a living expense
    const propExp=(bkt.property?.expenses||[]).reduce((s,e)=>s+num(e.amount),0);
    if(propExp)b.exps.push({id:uid(),name:'Property expenses (incl. mortgage)',amt:round2(propExp),per:'y'});
  });
  if(!b.incomes.length)pids.forEach(pid=>{b.incomes.push({id:uid(),name:'Salary',amt:0,per:'m',pid});});
  if(!b.exps.length)b.exps.push({id:uid(),name:'Rent / mortgage',amt:0,per:'m'});
  budList().push(b);
  BUD_OPEN=b.id;
  save();render();
  toast(`Budget "${name}" created from ${fyDisplay(y)} data`);
}
function budPrefillDeds(b,pids){
  pids.forEach(pid=>{
    (bucket(FY(),pid).preTaxDeds||[]).forEach(r=>{
      b.deds.push({name:r.name,amt:num(r.yearly),per:'y',pid});
    });
  });
}
function budDup(id){
  if(lockedGuard())return;
  const b=budGet(id);if(!b)return;
  const years=Object.values(DB.years).sort((a,c)=>fyOrderYear(c)-fyOrderYear(a));
  modal(`Duplicate "${esc(b.name)}"`,`
    <div class="fldrow"><div><label class="fld">Duplicate into</label><select id="f_dupfy" class="input">
      ${years.map(y=>`<option value="${y.startYear}" ${fyOrderYear(y)===fyOrderYear(FY())?'selected':''}>${esc(fyDisplay(y))}${y.locked?' 🔒':''}</option>`).join('')}
    </select></div></div>
    <div class="hint">Choose the same FY to make a copy alongside this one, or a different FY to bring it forward (or back) — handy for reusing a budget you've already set up.</div>
    ${b.isCombined?`<div class="note mt">This is a combined household budget — if you duplicate it into a different FY, you'll need to reselect each person's individual budget for that year afterward via "Edit sources".</div>`:''}`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="budDupSave('${id}')">Duplicate</button>`);
}
function budDupSave(id){
  const b=budGet(id);if(!b)return;
  const targetYr=num($('#f_dupfy').value);
  const targetY=yearByOrderYear(targetYr);
  if(!targetY)return toast("That financial year doesn't exist");
  if(targetY.locked)return toast(fyDisplay(targetY)+' is locked');
  const sameFY=fyOrderYear(targetY)===fyOrderYear(FY());
  const c=JSON.parse(JSON.stringify(b));c.id=uid();c.name=b.name+(sameFY?' (copy)':'');c.createdAt=todayISO();
  targetY.budgets=targetY.budgets||[];
  targetY.budgets.push(c);
  save();closeModal();render();
  toast(sameFY?'Budget duplicated':`Budget duplicated into ${fyDisplay(targetY)}`);
}
/* If a salary figure already includes super (e.g. a "$100k package
   including super" job offer), the actual taxable cash salary is lower —
   super is carved out of the package, not paid on top of it. */
function budIncomeTaxable(r,sgRate){
  const yearly=yrOf(r);
  return r.includesSuper?yearly/(1+(sgRate||11.5)/100):yearly;
}
function budTotals(y,b){
  const pids=b.scope==='all'?DB.people.map(p=>p.id):[b.scope];
  const incomes=budSourceList(b,'incomes'),deds=budSourceList(b,'deds');
  const sgRate=y.rates.superSGRate||11.5;
  let gross=0,tax=0,perP={};
  pids.forEach(pid=>{
    const g=incomes.filter(r=>(r.pid||pids[0])===pid).reduce((s,r)=>s+budIncomeTaxable(r,sgRate),0);
    const d=deds.filter(r=>(r.pid||pids[0])===pid).reduce((s,r)=>s+yrOf(r),0);
    const taxable=Math.max(0,g-d);
    const opts=b.isCombined?(budGet((b.sources||{})[pid])?.opts?.[pid]||defaultOpts()):(b.opts[pid]||defaultOpts());
    const t=fullTax(taxable,y.rates,opts);
    perP[pid]={gross:g,deds:d,taxable,t,opts};gross+=g;tax+=t.total;
  });
  const exps=(b.exps||[]).reduce((s,r)=>s+yrOf(r),0);
  const net=gross-tax, excess=net-exps;
  return{pids,perP,gross,tax,exps,net,excess};
}
function budRows(b,list,kind,withPerson){
  if(!list.length)return'';
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return list.map((r,i)=>{
    const per=r.per||'m';
    const perLabel={w:'Weekly',m:'Monthly',b:'Bi-annually',y:'Yearly'}[per]||'Monthly';
    let schedDetail='';
    if((per==='y'||per==='b')&&r.schedDay)schedDetail=` · ${MONTHS[(num(r.schedDay)||1)-1]||''}`;
    else if(per==='w'&&r.schedDay)schedDetail=` · ${DOW[(num(r.schedDay)||1)-1]||''}`;
    else if(per==='m'&&r.schedDay)schedDetail=` · day ${esc(String(r.schedDay))}`;
    const yearly=yrOf(r),monthly=yearly/12;
    const pp=withPerson?person(r.pid):null;
    return `<tr>
    <td><b>${esc(r.name)||'<span class="muted">Unnamed</span>'}</b>${kind==='incomes'&&r.includesSuper?' <span class="badge gold" style="font-size:.68rem">incl. super</span>':''}
      <div class="muted" style="font-size:.74rem">${perLabel}${schedDetail}</div></td>
    ${withPerson?`<td>${pdot(pp)} ${esc(pp.name)}</td>`:''}
    <td class="num">${fmt$(monthly)}</td>
    <td class="num">${fmt$(yearly)}</td>
    <td class="rowact"><button class="btn ghost small" onclick="budRowAdd('${b.id}','${kind}',${i})">Edit</button>
    <button class="btn ghost small" onclick="if(!lockedGuard())confirmDel('Delete ${esc(r.name)||'this row'}?',()=>{budGet('${b.id}').${kind}.splice(${i},1);save();render()})">✕</button></td></tr>`;
  }).join('');
}
function budSchedFieldHtml(per,val){
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  if(per==='y'||per==='b'){
    const sel=`<select id="bf_sched" class="input" style="max-width:160px" ${per==='b'?'onchange="budRowBiAnnualHint()"':''}>${MONTHS.map((mo,mi)=>`<option value="${mi+1}" ${String(val)===String(mi+1)?'selected':''}>${mo}</option>`).join('')}</select>`;
    if(per==='b'){
      const m1=num(val)||1,m2=((m1-1+6)%12)+1;
      return `${sel}<div class="muted" style="font-size:.74rem;margin-top:4px" id="bf_biHint">Second payment: ${MONTHS[m2-1]}</div>`;
    }
    return sel;
  }
  if(per==='w')return `<select id="bf_sched" class="input" style="max-width:160px">${DOW.map((d,di)=>`<option value="${di+1}" ${String(val)===String(di+1)?'selected':''}>${d}</option>`).join('')}</select>`;
  return `<input id="bf_sched" class="input" style="max-width:160px" placeholder="Day (1-31)" value="${esc(val||'')}">`;
}
function budRowBiAnnualHint(){
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sel=$('#bf_sched');const hint=$('#bf_biHint');if(!sel||!hint)return;
  const m1=num(sel.value)||1,m2=((m1-1+6)%12)+1;
  hint.textContent=`Second payment: ${MONTHS[m2-1]}`;
}
function budRowSchedToggle(){
  const per=$('#bf_per').value;
  const lbl=$('#bf_schedLabel');if(lbl)lbl.textContent=per==='w'?'Day of week':per==='m'?'Day of month':'Month';
  const f=$('#bf_schedField');if(f)f.innerHTML=budSchedFieldHtml(per,'');
}
/* Add/edit a budget row via modal — name, amount, frequency, and the
   matching schedule sub-field, plus person (household budgets) and
   include-super (income only). Matches the Income/Expenses/Deductions
   pages' edit-via-modal pattern instead of editing inline in the table. */
function budRowAdd(budId,kind,i){
  if(lockedGuard())return;
  const b=budGet(budId);if(!b)return;
  const pids=b.scope==='all'?DB.people.map(p=>p.id):[b.scope];
  const withPerson=(kind==='incomes'||kind==='deds')&&b.scope==='all';
  const r=i!=null?b[kind][i]:{name:'',amt:0,per:'m',pid:pids[0],schedDay:'',includesSuper:false};
  const per=r.per||'m';
  const kindLabel=kind==='incomes'?'income':kind==='deds'?'deduction':'expense';
  modal(i!=null?`Edit ${kindLabel}`:`Add ${kindLabel}`,`
    <div class="fldrow"><div style="flex:2"><label class="fld">Name</label><input id="bf_n" class="input" value="${esc(r.name)}" placeholder="e.g. ${kind==='incomes'?'Salary':kind==='deds'?'Novated lease':'Rent / mortgage'}"></div>
    ${withPerson?`<div><label class="fld">Person</label><select id="bf_pid" class="input">${pids.map(pid=>`<option value="${pid}" ${r.pid===pid?'selected':''}>${esc(person(pid).name)}</option>`).join('')}</select></div>`:''}</div>
    <div class="fldrow mt">
      <div><label class="fld">Amount ($)</label><input id="bf_amt" class="input money" value="${r.amt}"></div>
      <div><label class="fld">Frequency</label><select id="bf_per" class="input" onchange="budRowSchedToggle()">
        <option value="w" ${per==='w'?'selected':''}>Weekly</option>
        <option value="m" ${per==='m'?'selected':''}>Monthly</option>
        <option value="b" ${per==='b'?'selected':''}>Bi-annually</option>
        <option value="y" ${per==='y'?'selected':''}>Yearly</option>
      </select></div>
    </div>
    <div class="mt"><label class="fld" id="bf_schedLabel">${per==='w'?'Day of week':per==='m'?'Day of month':'Month'}</label>
      <div id="bf_schedField">${budSchedFieldHtml(per,r.schedDay)}</div></div>
    ${kind==='incomes'?`<label class="mt" style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="bf_super" ${r.includesSuper?'checked':''}> <span>Package amount already includes super</span></label>`:''}`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="budRowSave('${budId}','${kind}',${i==null?'null':i})">Save</button>`);
}
function budRowSave(budId,kind,i){
  if(FY().locked){lockedGuard();return;}
  const b=budGet(budId);if(!b)return;
  const prev=i!=null?b[kind][i]:null;
  const pids=b.scope==='all'?DB.people.map(p=>p.id):[b.scope];
  const r={id:prev?prev.id:uid(),name:$('#bf_n').value.trim()||'Untitled',amt:num($('#bf_amt').value),per:$('#bf_per').value,schedDay:$('#bf_sched')?$('#bf_sched').value:''};
  if(kind!=='exps'){
    if($('#bf_pid'))r.pid=$('#bf_pid').value;else r.pid=(prev&&prev.pid)||pids[0];
  }
  if(kind==='incomes')r.includesSuper=!!$('#bf_super')?.checked;
  if(i!=null)b[kind][i]=r;else b[kind].push(r);
  save();closeModal();render();toast('Saved');
}
function budOptSet(id,pid,k,v){
  if(lockedGuard())return;
  const b=budGet(id);b.opts[pid]=b.opts[pid]||defaultOpts();b.opts[pid][k]=v;save();renderBudgetCalc();
}
function budgetEditor(m,y,b){
  const hh=b.scope==='all';
  const pids=hh?DB.people.map(p=>p.id):[b.scope];
  const combined=!!b.isCombined;
  head(m,esc(b.name),`${budScopeLabel(b)}${combined?' · live-linked to individual budgets below':''} · saved in ${esc(fyDisplay(y))} — edits stick, and the ${esc(y.label)} rate snapshot does the tax.`,
    `<button class="btn" onclick="budRename('${b.id}')">Rename</button>
     ${combined?`<button class="btn" onclick="budCombinedOpen('${b.id}')">⇄ Change sources</button>`:''}
     <button class="btn" onclick="BUD_OPEN=null;render()">← All budgets</button>`);
  const pcol=hh?'<th>Person</th>':'';
  const incomes=budSourceList(b,'incomes'),deds=budSourceList(b,'deds');
  let incCard,dedCard,optBlock;
  if(combined){
    const lineRows=(list)=>list.map(r=>`<tr><td>${esc(r.name||'—')}</td><td>${pdot(person(r.pid))} ${esc(person(r.pid).name)}</td><td class="num">${fmt$(yrOf(r))}</td></tr>`).join('');
    incCard=`<div class="card"><div class="chead"><h2>Gross income</h2><span class="hint">read-only — from individual budgets</span></div>
      <div class="cbody tight"><table class="tbl"><thead><tr><th>Source</th><th>Person</th><th class="num">Yearly</th></tr></thead>
      <tbody>${lineRows(incomes)||'<tr><td colspan="3" class="muted">No income rows in the selected individual budgets.</td></tr>'}</tbody></table></div></div>`;
    dedCard=`<div class="card"><div class="chead"><h2>Pre-tax deductions</h2><span class="hint">read-only — from individual budgets</span></div>
      <div class="cbody tight"><table class="tbl"><thead><tr><th>Deduction</th><th>Person</th><th class="num">Yearly</th></tr></thead>
      <tbody>${lineRows(deds)||'<tr><td colspan="3" class="muted">No deduction rows.</td></tr>'}</tbody></table></div>
      <div class="cbody" style="padding-top:0"><div class="hint">e.g. investment property, novated lease, super contributions, WFH — these reduce taxable income before tax is calculated.</div></div></div>`;
    optBlock=pids.map(pid=>{
      const pp=person(pid),src=budGet((b.sources||{})[pid]);
      if(!src)return `<div style="margin-bottom:12px"><div style="font-weight:600;margin-bottom:6px">${pdot(pp)} ${esc(pp.name)}</div><div class="hint">No individual budget selected — <a href="#" onclick="budCombinedOpen('${b.id}');return false">choose one</a>.</div></div>`;
      const o=src.opts?.[pid]||defaultOpts();
      return `<div style="margin-bottom:12px"><div style="font-weight:600;margin-bottom:6px">${pdot(pp)} ${esc(pp.name)} <span class="muted" style="font-weight:400;font-size:.78rem">— from "${esc(src.name)}"</span></div>
      <div class="hint">Medicare levy: <b>${o.medicare?'yes':'no'}</b> (${y.rates.medicare.rate}%) · MLS applies: <b>${o.mls?'yes':'no'}</b>${o.mls?(o.hasCover?' <span class="muted">(exempt — has cover)</span>':''):''}</div></div>`;
    }).join('<hr style="border:none;border-top:1px solid var(--line);margin:10px 0">')
      +`<div class="hint mt">Change Medicare/MLS settings on each person's individual budget — <a href="#" onclick="budCombinedOpen('${b.id}');return false">change which budgets feed this view</a>.</div>`;
  }else{
    incCard=`<div class="card"><div class="chead"><h2>Gross income</h2><button class="btn small" onclick="budRowAdd('${b.id}','incomes')">+ Add</button></div>
      <div class="cbody tight"><table class="tbl"><thead><tr><th>Source</th>${pcol}<th class="num">Monthly</th><th class="num">Yearly</th><th></th></tr></thead>
      <tbody>${budRows(b,b.incomes,'incomes',hh)||`<tr><td colspan="${hh?4:3}" class="muted">No income sources yet — add your salary or other income.</td></tr>`}</tbody></table></div></div>`;
    dedCard=`<div class="card"><div class="chead"><h2>Pre-tax deductions</h2><button class="btn small" onclick="budRowAdd('${b.id}','deds')">+ Add</button></div>
      <div class="cbody tight"><table class="tbl"><thead><tr><th>Deduction</th>${pcol}<th class="num">Monthly</th><th class="num">Yearly</th><th></th></tr></thead>
      <tbody>${budRows(b,b.deds,'deds',hh)||`<tr><td colspan="${hh?4:3}" class="muted">None — e.g. investment property, novated lease, super contributions, WFH.</td></tr>`}</tbody></table></div>
      <div class="cbody" style="padding-top:0"><div class="hint">e.g. investment property, novated lease, super contributions, WFH — these reduce taxable income before tax is calculated.</div></div></div>`;
    optBlock=pids.map(pid=>{
      const o=b.opts[pid]||defaultOpts();const pp=person(pid);
      return `<div style="margin-bottom:12px"><div style="font-weight:600;margin-bottom:6px">${hh?pdot(pp)+' '+esc(pp.name):''}</div>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" ${o.medicare?'checked':''} onchange="budOptSet('${b.id}','${pid}','medicare',this.checked)"> Medicare levy (${y.rates.medicare.rate}%)</label>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" ${o.mls?'checked':''} onchange="budOptSet('${b.id}','${pid}','mls',this.checked)"> MLS applies</label>
      <label style="display:flex;gap:8px;align-items:center;padding-left:24px"><input type="checkbox" ${o.hasCover?'checked':''} onchange="budOptSet('${b.id}','${pid}','hasCover',this.checked)"> …but holds private hospital cover (exempt)</label></div>`;
    }).join('<hr style="border:none;border-top:1px solid var(--line);margin:10px 0">');
  }
  m.insertAdjacentHTML('beforeend',`
  <div class="grid2">
    <div>
      ${incCard}
      ${dedCard}
      <div class="card"><div class="chead"><h2>Post-tax expenses ${hh?'(shared)':''}</h2><button class="btn small" onclick="budRowAdd('${b.id}','exps')">+ Add</button></div>
      <div class="cbody tight"><table class="tbl"><thead><tr><th>Expense</th><th class="num">Monthly</th><th class="num">Yearly</th><th></th></tr></thead>
      <tbody>${budRows(b,b.exps,'exps',false)||'<tr><td colspan="3" class="muted">No expenses yet — add rent/mortgage, groceries, utilities, and so on.</td></tr>'}</tbody></table></div></div>
    </div>
    <div>
      <div class="card"><div class="chead"><h2>Levies & repayments</h2></div><div class="cbody">${optBlock}</div></div>
      <div class="card"><div class="chead"><h2>Result</h2><span class="hint">click a row with ▸ to expand its components</span></div><div class="cbody tight" id="budCalc"></div></div>
      <div class="card"><div class="chead"><h2>Cash projection — excess accumulating over ${esc(fyDisplay(y))}</h2></div><div class="cbody" id="budProj"></div></div>
      <div class="card"><div class="chead"><h2>Savings allocation</h2><span class="hint">where excess cash goes</span></div><div class="cbody" id="budAlloc"></div></div>
      <div class="card"><div class="chead"><h2>Yearly cash split</h2></div><div class="cbody" id="budDonut"></div></div>
    </div>
  </div>`);
  // Monthly cashflow chart — gross income vs post-tax expenses, distributed
  // across the FY according to each row's Per/Day-Date schedule.
  const incMo=budMonthlyFlow(incomes);
  const expMo=budMonthlyFlow(b.exps);
  const cashData=FY_MONTHS.map((label,i)=>({label,value:incMo[i]||0,value2:expMo[i]||0}));
  const yearlyInc=incomes.reduce((s,r)=>s+yrOf(r),0);
  const yearlyExpB=(b.exps||[]).reduce((s,r)=>s+yrOf(r),0);
  const surplusB=yearlyInc-yearlyExpB;
  m.insertAdjacentHTML('beforeend',`
  <div class="card"><div class="chead"><h2>Monthly cashflow — ${esc(fyDisplay(y))}</h2>
    <span class="hint">${fmt$0(yearlyInc)}/yr income · ${fmt$0(yearlyExpB)}/yr expenses · <span style="color:${surplusB>=0?'var(--euc)':'var(--red)'}">${surplusB>=0?'▲':'▼'} ${fmt$0(Math.abs(surplusB))} ${surplusB>=0?'surplus':'shortfall'}</span></span></div>
    <div class="cbody">${barChartSVG(cashData,{aria:'Monthly cashflow — income vs expenses',label2:'Expenses'})}
    <div style="display:flex;gap:16px;font-size:.8rem;margin-top:6px">
      <span><span style="display:inline-block;width:12px;height:12px;background:var(--euc);border-radius:3px;margin-right:5px;vertical-align:-2px"></span>Income</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:var(--gold);border-radius:3px;margin-right:5px;vertical-align:-2px"></span>Expenses</span>
    </div>
    <div class="hint mt">Based on each row's Per / Day-Date schedule above — yearly and bi-annual items land in their chosen month(s); weekly/monthly items are spread evenly. Pre-tax deductions aren't shown here (see Result for their effect on tax).</div>
    </div></div>`);
  renderBudgetCalc();
}
function budRename(id){
  if(lockedGuard())return;
  const b=budGet(id);const v=prompt('Budget name:',b.name);
  if(v!=null){b.name=v.trim()||b.name;save();render();}
}
let BUD_EXP={};
function budToggle(k){BUD_EXP[k]=!BUD_EXP[k];renderBudgetCalc();}
function renderBudgetCalc(){
  const el=$('#budCalc');if(!el)return;
  const y=FY(),b=BUD_OPEN&&budGet(BUD_OPEN);if(!b)return;
  const r=budTotals(y,b);
  const hh=r.pids.length>1;
  const incomes=budSourceList(b,'incomes'),deds=budSourceList(b,'deds');
  const grp=(key,label,vY,subs,cls)=>{
    const open=BUD_EXP[key];
    let h=`<tr class="grp ${open?'open':''}" onclick="budToggle('${key}')"><td>${label}</td><td class="num">${fmt$(vY/12)}</td><td class="num" style="${cls||''}">${fmt$(vY)}</td></tr>`;
    if(open)subs.forEach(s=>{h+=`<tr class="sub"><td>${esc(s.n)}</td><td class="num">${fmt$(s.v/12)}</td><td class="num">${fmt$(s.v)}</td></tr>`;});
    return h;
  };
  const plain=(label,vY,opts={})=>`<tr class="${opts.tot?'tot':'plain'}"><td>${label}</td><td class="num">${fmt$(vY/12)}</td><td class="num" style="${opts.c||''}">${fmt$(vY)}</td></tr>`;
  let rows='';
  r.pids.forEach(pid=>{
    const pp=person(pid),x=r.perP[pid],o=x.opts;
    const pfx=hh?pid+':':'';
    if(hh)rows+=`<tr><td colspan="3" style="font-weight:700;padding-top:14px">${pdot(pp)} ${esc(pp.name)}</td></tr>`;
    const incSubs=incomes.filter(q=>(q.pid||r.pids[0])===pid).map(q=>({n:q.name||'Income',v:yrOf(q)}));
    const dedSubs=deds.filter(q=>(q.pid||r.pids[0])===pid).map(q=>({n:q.name||'Deduction',v:-yrOf(q)}));
    rows+=grp(pfx+'g','Gross income',x.gross,incSubs);
    rows+=grp(pfx+'d','Pre-tax deductions',-x.deds,dedSubs);
    rows+=plain('<b>Taxable income</b>',x.taxable);
    const taxSubs=[{n:'Income tax',v:-x.t.base}];
    if(x.t.lito)taxSubs.push({n:'Low income tax offset',v:x.t.lito});
    if(o.medicare)taxSubs.push({n:'Medicare levy',v:-x.t.medicare});
    if(o.mls&&x.t.mls)taxSubs.push({n:'Medicare levy surcharge',v:-x.t.mls});
    rows+=grp(pfx+'t','Tax payable',-x.t.total,taxSubs,'color:var(--red)');
    rows+=plain('Net income',x.gross-x.t.total,{c:'color:var(--euc)'});
  });
  if(hh)rows+=plain('<b>Household net income</b>',r.net,{c:'color:var(--euc)'});
  const expSubs=b.exps.map(q=>({n:q.name||'Expense',v:-yrOf(q)}));
  rows+=grp('x','Post-tax expenses',-r.exps,expSubs);
  rows+=plain('Excess cash',r.excess,{tot:1,c:r.excess>=0?'color:var(--gold)':'color:var(--red)'});
  el.innerHTML=`<table class="restbl"><thead><tr><th></th><th>Monthly</th><th>Yearly</th></tr></thead><tbody>${rows}</tbody></table>`;
  // cumulative excess projection
  const proj=$('#budProj');
  if(proj){
    const pts=FY_MONTHS.map((mLabel,i)=>({label:mLabel,value:r.excess/12*(i+1)}));
    proj.innerHTML=lineChartSVG(pts,{aria:'Cumulative excess cash over the year'})
      +`<div class="hint" style="margin-top:6px">Assumes income and expenses land evenly each month: ~${fmt$(r.excess/12)} excess per month, ${fmt$(r.excess)} by 30 June.</div>`;
  }
  const segs=b.exps.filter(x=>yrOf(x)>0).map(x=>({n:x.name||'Expense',v:yrOf(x)}));
  if(r.excess>0)segs.push({n:'Excess cash',v:r.excess});
  $('#budDonut').innerHTML=donutSVG(segs);
  renderBudgetAlloc(b,r.excess);
}
function renderBudgetAlloc(b,excess){
  const el=$('#budAlloc');if(!el)return;
  const allocs=b.allocations=b.allocations||[];
  const totalPct=allocs.reduce((s,a)=>s+num(a.pct),0);
  const nwItems=DB.nw.items.filter(it=>!isAll()||true);
  const rows=allocs.map((a,i)=>{
    const it=DB.nw.items.find(x=>x.id===a.itemId);
    const monthly=excess/12*num(a.pct)/100;
    const latest=it?nwEntriesOf?.(it.id)||[]:[];
    const cur=latest.length?num(latest[latest.length-1].value):0;
    return `<div class="kv"><span class="k"><select class="input" style="width:160px;height:28px;font-size:.8rem" onchange="budAllocSet('${b.id}',${i},'itemId',this.value)">
      <option value="">— pick item —</option>${nwItems.map(x=>`<option value="${x.id}" ${x.id===a.itemId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></span>
      <span style="display:flex;gap:6px;align-items:center">
        <input class="input money" style="width:60px;height:28px;font-size:.8rem" value="${a.pct}" oninput="budAllocSet('${b.id}',${i},'pct',this.value)"> %
        <span class="muted" style="font-size:.8rem">${fmt$(monthly)}/mo</span>
        <button class="btn ghost small" onclick="budAllocRemove('${b.id}',${i})">✕</button></span></div>`;
  }).join('');
  const unalloc=Math.max(0,100-totalPct);
  el.innerHTML=`${rows||'<div class="muted" style="padding:6px 0">No allocations yet</div>'}
    <div class="kv" style="margin-top:8px"><span class="k">Unallocated / spending</span><span class="v">${unalloc.toFixed(0)}% — ${fmt$(excess/12*unalloc/100)}/mo</span></div>
    <button class="btn small mt" onclick="budAllocAdd('${b.id}')">+ Allocation</button>
    ${allocs.length?`<div class="mt"><b>Projection — selected items over time</b></div>${budAllocProjection(b,excess)}`:''}`;
}
function budAllocSet(id,i,k,v){const b=budGet(id);if(b)b.allocations[i][k]=k==='pct'?v:v;save();renderBudgetCalc();}
function budAllocAdd(id){const b=budGet(id);if(b){b.allocations.push({id:uid(),itemId:'',pct:0});save();renderBudgetAlloc(b,0);}}
function budAllocRemove(id,i){const b=budGet(id);if(b){b.allocations.splice(i,1);save();renderBudgetCalc();}}
function budAllocProjection(b,excess){
  const allocs=(b.allocations||[]).filter(a=>a.itemId&&num(a.pct)>0);
  if(!allocs.length)return '';
  const periods=[{y:1,l:'1 yr'},{y:2,l:'2 yrs'},{y:5,l:'5 yrs'},{y:10,l:'10 yrs'}];
  const rows=allocs.map(a=>{
    const it=DB.nw.items.find(x=>x.id===a.itemId);if(!it)return'';
    const es=nwEntriesOf?.(it.id)||[];
    const cur=es.length?num(es[es.length-1].value):0;
    const monthly=excess/12*num(a.pct)/100;
    const cells=periods.map(p=>`<td class="num">${fmt$0(cur+monthly*12*p.y)}</td>`).join('');
    return `<tr><td>${esc(it.name)}</td><td class="num">${fmt$0(cur)}</td>${cells}</tr>`;
  }).join('');
  if(!rows)return '';
  const hdrs=periods.map(p=>`<th class="num">+${p.l}</th>`).join('');
  return `<table class="tbl mt" style="font-size:.84rem"><thead><tr><th>Item</th><th class="num">Today</th>${hdrs}</tr></thead><tbody>${rows}</tbody></table>`;
}
const DONUT_COLS=['#2E7D5B','#B8860B','#2563B8','#B4452F','#E2925A','#7A6FB3','#4FA3A5','#9A7B4F','#5BA742','#A14F86'];
function donutSVG(segs){
  const tot=segs.reduce((s,x)=>s+x.v,0);if(!tot)return '<div class="muted">Add expenses to see the split.</div>';
  let a=-Math.PI/2,paths='';const cx=80,cy=80,r1=78,r0=46;
  segs.forEach((s,i)=>{const frac=s.v/tot,a2=a+frac*2*Math.PI;
    const large=frac>.5?1:0;
    const p=(rr,ang)=>`${cx+rr*Math.cos(ang)},${cy+rr*Math.sin(ang)}`;
    paths+=`<path d="M${p(r1,a)} A${r1},${r1} 0 ${large} 1 ${p(r1,a2)} L${p(r0,a2)} A${r0},${r0} 0 ${large} 0 ${p(r0,a)} Z" fill="${DONUT_COLS[i%DONUT_COLS.length]}" opacity=".92"><title>${esc(s.n)}: ${fmt$(s.v)}</title></path>`;a=a2;});
  const leg=segs.map((s,i)=>`<div><span class="sw" style="background:${DONUT_COLS[i%DONUT_COLS.length]}"></span>${esc(s.n)} — <b>${fmt$(s.v)}</b> (${(s.v/tot*100).toFixed(1)}%)</div>`).join('');
  return `<div class="donutwrap"><svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Cash split">${paths}</svg><div class="donutleg">${leg}</div></div>`;
}
/* ---- shared: platform datalist + ASX security search ---- */
function platOptions(){return (DB.platforms||[]).map(p=>`<option>${esc(p)}</option>`).join('');}
const PLATFORM_DEFAULT_COLORS=['#2E7D5B','#4C6FFF','#C0392B','#D4A017','#7E57C2','#16A085','#E67E22','#2980B9','#8E44AD','#27AE60'];
/* Colour for a platform pill — uses the user's chosen colour if set,
   otherwise a stable deterministic default so unset platforms still look
   distinct and consistent rather than all-grey. */
function platformColor(name){
  if(!name)return '#888888';
  if(DB.platformColors&&DB.platformColors[name])return DB.platformColors[name];
  let hash=0;for(let i=0;i<name.length;i++)hash=(hash*31+name.charCodeAt(i))>>>0;
  return PLATFORM_DEFAULT_COLORS[hash%PLATFORM_DEFAULT_COLORS.length];
}
function settingsPlatformColor(name,color){
  DB.platformColors=DB.platformColors||{};
  DB.platformColors[name]=color;
  save();render();
}
function platformPill(name){
  const c=platformColor(name);
  return `<span class="badge" style="background:${c}22;border-color:${c};color:${c}">${esc(name)}</span>`;
}
function secSearchBox(codeSel,nameSel){
  return `<label class="fld">Search ASX (code or name)</label>
    <input class="input" placeholder="e.g. VAS or Vanguard" oninput="secSearch(this,'${codeSel}','${nameSel||''}')"><div class="searchres" id="srchRes"></div>`;
}
let _srchT=null;
function secSearch(inp,codeSel,nameSel){
  clearTimeout(_srchT);
  const q=inp.value.trim();const box=$('#srchRes');
  if(q.length<2){box.innerHTML='';return;}
  _srchT=setTimeout(async()=>{
    const ql=q.toLowerCase();
    let res=ASX_STATIC.filter(s=>s[0].toLowerCase().includes(ql)||s[1].toLowerCase().includes(ql));
    const api=await asxApiSearch(q);
    if(api&&api.length){const seen=new Set(res.map(r=>r[0]));api.forEach(r=>{if(!seen.has(r[0]))res.push(r);});}
    box.innerHTML=res.slice(0,12).map(s=>`<button type="button" onclick="$('${codeSel}').value='${s[0]}';${nameSel?`if($('${nameSel}'))$('${nameSel}').value='${esc(s[1]).replace(/'/g,"\\'")}';`:''}this.parentNode.innerHTML=''"><b>${s[0]}</b><span class="muted">${esc(s[1])}</span></button>`).join('')
      ||'<button type="button" disabled>No matches — enter the code manually</button>';
  },250);
}

/* ================= INCOME ================= */
PAGES.income=m=>{
  const y=FY(),B=PD();
  head(m,'Income',`All income for ${esc(fyDisplay(y))} — salary, dividends and fund distributions in one view.`,
    `<button class="btn primary" onclick="incomeAdd()">+ Add salary / income source</button>`);
  /* ---- Salary & wages ---- */
  const sgRate=FY().rates.superSGRate||11.5;
  const incRows=B.incomes.map((r,i)=>{
    const sg=r.attractsSuper?num(r.yearly)*sgRate/100:0;
    return `<tr>
    <td><b>${esc(r.name)}</b>${r.attractsSuper?` <span class="badge gold" style="font-size:.68rem">SG ${sgRate}%</span>`:''}
      ${r.receiptId?`<span class="rcpt-file" style="font-size:.74rem" onclick="rcptView('${r.receiptId}','${esc(r.name)} statement')" title="${esc(r.receiptName||'statement')}">📎</span>`:''}
      <div class="muted" style="font-size:.74rem">${RECURRENCE_OPTS.find(([v])=>v===(r.recurrence||'monthly'))?.[1]||'Monthly'}${r.schedDay?' · day '+r.schedDay:''}${r.date?' · '+fmtDate(r.date):''}${sg?` · super ~${fmt$0(sg)}/yr`:''}</div></td>
    <td><span class="badge euc" style="font-size:.7rem">${esc(r.kind||'')}</span></td>
    <td class="num">${r.recurrence==='once'?'<span class="muted">one-off</span>':fmt$(num(r.yearly)/12)}</td><td class="num">${fmt$(r.yearly)}</td>
    <td class="num">${fmt$(r.taxWithheld||0)}</td>
    <td class="rowact"><button class="btn ghost small" onclick="incomeAdd(${i})">Edit</button>
    <button class="btn ghost small" onclick="if(!lockedGuard())confirmDel('Delete ${esc(r.name)}?',()=>{incomeDeleteRow(${i})})">\u2715</button></td></tr>`;
  }).join('');
  const incTot=B.incomes.reduce((s,r)=>s+num(r.yearly),0);
  const incWh=B.incomes.reduce((s,r)=>s+num(r.taxWithheld),0);
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="chead"><h2>Salary & other income</h2></div><div class="cbody tight"><table class="tbl">
    <thead><tr><th>Source</th><th>Type</th><th class="num">Monthly</th><th class="num">Yearly</th><th class="num">Tax withheld</th><th></th></tr></thead>
    <tbody>${incRows||'<tr><td colspan="6" class="muted">No salary recorded — add your employer income to get started.</td></tr>'}
    <tr class="total"><td colspan="2">Subtotal</td><td class="num">${fmt$(incTot/12)}</td><td class="num">${fmt$(incTot)}</td><td class="num">${fmt$(incWh)}</td><td></td></tr></tbody></table></div></div>`);
  /* ---- Pre-tax deductions (salary sacrifice) ---- */
  const ptd=B.preTaxDeds||(B.preTaxDeds=[]);
  const ptdRows=ptd.map((r,i)=>{
    const veh=r.vehicleId?DB.assets.find(a=>a.id===r.vehicleId):null;
    const led=r.type==='Novated lease'?leaseEndDate(r):null;
    const today=todayISO();
    const leaseExpired=led&&led<today;
    const leaseSoon=led&&!leaseExpired&&(new Date(led)-Date.now())<180*86400*1000;
    return `<tr>
    <td><b>${esc(r.name)}</b><div class="muted" style="font-size:.74rem">${esc(r.type)} · ${RECURRENCE_OPTS.find(([v])=>v===(r.recurrence||'monthly'))?.[1]||'Monthly'}${r.schedDay?' · day '+r.schedDay:''}${r.date?' · '+fmtDate(r.date):''}${veh?` · 🚗 ${esc(veh.name)}`:''}${r.incomeId?(()=>{const inc=B.incomes.find(x=>x.id===r.incomeId);return inc?` · <span class="badge blue" style="font-size:.65rem">↳ ${esc(inc.name)}</span>`:''})():''}</div>${led?`<div style="font-size:.74rem;margin-top:2px;color:${leaseExpired?'var(--red)':leaseSoon?'var(--gold)':'var(--muted)'}">🗓 Lease ends ${fmtDate(led)} · ${leaseCountdown(led)}${r.residualAmount?` · residual ${fmt$0(r.residualAmount)}`:''}${leaseExpired?' ⚠ expired':leaseSoon?' ⚠ ending soon':''}</div>`:''}</td>
    <td class="num">${r.recurrence==='once'?'<span class="muted">one-off</span>':fmt$(num(r.yearly)/12)}</td><td class="num">${fmt$(r.yearly)}</td>
    <td class="rowact"><button class="btn ghost small" onclick="preTaxDedAdd(${i})">Edit</button>
    <button class="btn ghost small" onclick="if(!lockedGuard())confirmDel('Delete ${esc(r.name)}?',()=>{PD().preTaxDeds.splice(${i},1);save();render()})">\u2715</button></td></tr>`;}).join('');
  const ptdTot=ptd.reduce((s,r)=>s+num(r.yearly),0);
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="chead"><h2>Pre-tax deductions (salary sacrifice)</h2><button class="btn small" onclick="preTaxDedAdd()">+ Row</button></div><div class="cbody tight"><table class="tbl">
    <thead><tr><th>Type</th><th class="num">Monthly</th><th class="num">Yearly</th><th></th></tr></thead>
    <tbody>${ptdRows||'<tr><td colspan="4" class="muted">None — e.g. additional super contributions or a novated lease arranged through your employer before tax.</td></tr>'}
    ${ptdTot?`<tr class="total"><td>Subtotal</td><td class="num">${fmt$(ptdTot/12)}</td><td class="num">${fmt$(ptdTot)}</td><td></td></tr>`:''}</tbody></table></div>
    ${ptdTot?`<div class="note">Reduces <b>taxable income</b> in the FY summary — shown there as "Pre-tax deductions". Keep entering your full package salary above as usual; this is subtracted separately.</div>`:''}
    </div>`);
  /* ---- Rental income from property assets (auto-calculated) ---- */
  const rentalAssets=(typeof assetsForPerson==='function')?assetsForPerson([DB.currentPid]).filter(a=>a.kind==='property'&&a.rental?.history?.length):[];
  const rentalTotal=rentalAssets.reduce((s,a)=>s+rentalIncomeEffective(a,FY()),0);
  if(rentalAssets.length){
    const rentalRows=rentalAssets.map(a=>{
      const inc=rentalIncomeEffective(a,y);
      const calc=rentalIncomeForFY(a,y);
      const isOverridden=a.rentalOverrides&&a.rentalOverrides[String(y.startYear)]!=null;
      const fyRateDisplay=rentalRateDisplayForFY(a,y);
      return `<tr>
        <td><b>${esc(a.name)}</b><div class="muted" style="font-size:.74rem">${fyRateDisplay?fyRateDisplay+' this FY · ':''}<a href="#" onclick="go('assets');return false">manage in Assets ↗</a></div>
          ${isOverridden?`<div style="font-size:.74rem;margin-top:2px"><span class="badge gold">overridden</span> <span class="muted">calculated: ${fmt$(calc)}</span> <a href="#" onclick="rentalOverrideEdit('${a.id}');return false">edit</a> · <a href="#" onclick="rentalOverrideClear('${a.id}');return false">clear</a></div>`
            :`<div style="font-size:.74rem;margin-top:2px"><a href="#" onclick="rentalOverrideEdit('${a.id}');return false">override this FY's figure</a></div>`}
        </td>
        <td><span class="badge euc" style="font-size:.7rem">Rental income</span></td>
        <td class="num muted">—</td><td class="num">${fmt$(inc)}</td><td class="num muted">—</td>
        <td></td></tr>`;
    }).join('');
    m.insertAdjacentHTML('beforeend',`<div class="card"><div class="chead"><h2>Rental income <span class="badge euc">auto from Assets</span></h2></div><div class="cbody tight"><table class="tbl">
      <thead><tr><th>Property</th><th>Type</th><th class="num">Monthly avg</th><th class="num">FY total</th><th class="num">Tax withheld</th><th></th></tr></thead>
      <tbody>${rentalRows}
      ${rentalAssets.length>1?`<tr class="total"><td colspan="3">Rental subtotal</td><td class="num">${fmt$(rentalTotal)}</td><td colspan="2"></td></tr>`:''}
      </tbody></table>
      <div class="note">Rental income is calculated automatically from the rate history set on each property in <a href="#" onclick="go('assets');return false">Assets</a>, bounded by its purchase date. Prorated for mid-year rate changes. Use "override this FY's figure" if the actual amount received differs (e.g. a missed payment or unrecorded vacancy).</div>
    </div></div>`);
  }
  /* ---- Share dividends ---- */
  const divGroups={};
  B.dividends.forEach(d=>{(divGroups[d.code]=divGroups[d.code]||[]).push(d);});
  const divCodes=Object.keys(divGroups).sort();
  const divTot=B.dividends.reduce((s,d)=>s+num(d.payment),0);
  const divCr=B.dividends.reduce((s,d)=>s+num(d.frankingCredit),0);
  const divUnfrk=B.dividends.reduce((s,d)=>s+num(d.unfranked),0);
  const divFrk=B.dividends.reduce((s,d)=>s+num(d.franked),0);
  const divMonths=FY_MONTHS.map(l=>({label:l,value:0}));
  B.dividends.forEach(d=>{if(d.date)divMonths[monthIndexFY(d.date)].value+=num(d.payment);});
  const divSecRows=divCodes.map(c=>{
    const g=divGroups[c];
    const t=g.reduce((s,d)=>({pay:s.pay+num(d.payment),cr:s.cr+num(d.frankingCredit),unfrk:s.unfrk+num(d.unfranked),frk:s.frk+num(d.franked)}),{pay:0,cr:0,unfrk:0,frk:0});
    return `<tr><td><b>${esc(c)}</b></td><td>${esc(g[0].platform||'')}</td><td class="num">${g.length}</td><td class="num">${fmt$(t.unfrk)}</td><td class="num">${fmt$(t.frk)}</td><td class="num">${fmt$(t.cr)}</td><td class="num">${fmt$(t.pay)}</td></tr>`;
  }).join('');
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="chead"><h2>Share dividends</h2>
    <span class="actions"><span class="hint">${B.dividends.length} payment(s) &middot; ${fmt$(divTot)} total &middot; ${fmt$(divCr)} credits</span>
    <button class="btn small" onclick="go('dividends')">Manage \u2197</button></span></div>
    ${divTot?`<div class="cbody">${barChartSVG(divMonths,{aria:'Dividends by month'})}</div>`:''}
    ${divSecRows?`<div class="cbody tight"><table class="tbl"><thead><tr><th>Security</th><th>Platform</th><th class="num">Payments</th><th class="num">Unfranked</th><th class="num">Franked</th><th class="num">Franking credits</th><th class="num">Total received</th></tr></thead>
    <tbody>${divSecRows}<tr class="total"><td colspan="3">Subtotal</td><td class="num">${fmt$(divUnfrk)}</td><td class="num">${fmt$(divFrk)}</td><td class="num">${fmt$(divCr)}</td><td class="num">${fmt$(divTot)}</td></tr></tbody></table></div>`
    :`<div class="cbody"><span class="muted">No dividends recorded for this year — <a href="#" onclick="go('dividends');return false">add them here</a>.</span></div>`}
  </div>`);
  /* ---- Managed fund distributions ---- */
  const fp=B.fundPayments||[];
  const fpGroups={};fp.forEach(p=>{(fpGroups[p.code]=fpGroups[p.code]||[]).push(p);});
  const fpCodes=Object.keys(fpGroups).sort();
  const fpTot=fp.reduce((s,p)=>s+num(p.amount),0);
  const fpMonths=FY_MONTHS.map(l=>({label:l,value:0}));
  fp.forEach(p=>{if(p.date)fpMonths[monthIndexFY(p.date)].value+=num(p.amount);});
  const {assess:fundAssess,offsets:fundOffsets,ded:fundDed}=fundLabelTotals(B);
  // Per-fund breakdown straight from the AMIT label data entered on the
  // Managed Funds page — this is the actual yearly tax-relevant figure,
  // and is often filled in even when no cash payments have been logged.
  const fundLabelRows=B.funds.map(f=>{
    const assess=MFD_INCOME_LABELS.reduce((s,k)=>s+num(f.labels?.[k]),0);
    const offsets=MFD_OFFSET_LABELS.reduce((s,k)=>s+num(f.labels?.[k]),0);
    const ded=MFD_DEDUCTION_LABELS.reduce((s,k)=>s+num(f.labels?.[k]),0);
    if(!assess&&!offsets&&!ded)return'';
    return `<tr><td><b>${esc(f.code)}</b>${f.name?`<div class="muted" style="font-size:.74rem">${esc(f.name)}</div>`:''}</td><td class="num">${fmt$(assess)}</td><td class="num">${offsets?fmt$(offsets):'<span class="muted">—</span>'}</td><td class="num">${ded?fmt$(ded):'<span class="muted">—</span>'}</td></tr>`;
  }).filter(Boolean).join('');
  const fpRows=fpCodes.map(c=>{
    const g=fpGroups[c],t=g.reduce((s,p)=>s+num(p.amount),0);
    return `<tr><td><b>${esc(c)}</b></td><td class="num">${g.length}</td><td class="num">${fmt$(t)}</td></tr>`;
  }).join('');
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="chead"><h2>Managed fund distributions</h2>
    <span class="actions"><span class="hint">${fmt$(fundAssess)} assessable${fundOffsets?` · ${fmt$(fundOffsets)} offsets`:''}${fundDed?` · ${fmt$(fundDed)} deductions`:''} (ATO labels)</span>
    <button class="btn small" onclick="go('funds')">Manage \u2197</button></span></div>
    ${fundLabelRows?`<div class="cbody tight"><table class="tbl"><thead><tr><th>Fund</th><th class="num">Assessable income</th><th class="num">Tax offsets</th><th class="num">Deductions</th></tr></thead>
    <tbody>${fundLabelRows}<tr class="total"><td>Subtotal</td><td class="num">${fmt$(fundAssess)}</td><td class="num">${fmt$(fundOffsets)}</td><td class="num">${fmt$(fundDed)}</td></tr></tbody></table></div>`
    :`<div class="cbody"><span class="muted">No AMIT statement labels filled in yet — <a href="#" onclick="go('funds');return false">add them in ETF / Managed Funds</a> (or import a statement).</span></div>`}
    ${fpTot?`<div class="cbody"><div class="muted" style="font-size:.8rem;margin-bottom:6px">Cash payments actually received (separate from the tax labels above):</div>${barChartSVG(fpMonths,{aria:'Fund distributions by month'})}
    <table class="tbl mt"><thead><tr><th>Fund</th><th class="num">Distributions</th><th class="num">Total received</th></tr></thead>
    <tbody>${fpRows}<tr class="total"><td>Subtotal</td><td></td><td class="num">${fmt$(fpTot)}</td></tr></tbody></table></div>`:''}
  </div>`);
  /* ---- Grand total summary ---- */
  const rentalTotForSummary=(typeof assetsForPerson==='function')?assetsForPerson([DB.currentPid]).filter(a=>a.kind==='property'&&a.rental?.history?.length).reduce((s,a)=>s+rentalIncomeEffective(a,FY()),0):0;
  const assessTotal=incTot+divTot+divCr+fundAssess+rentalTotForSummary;
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="chead"><h2>Income summary</h2></div><div class="cbody">
    <table class="restbl" style="max-width:560px"><thead><tr><th></th><th>Monthly avg.</th><th>Yearly total</th></tr></thead><tbody>
      <tr><td>Salary & other income</td><td class="num">${fmt$(incTot/12)}</td><td class="num">${fmt$(incTot)}</td></tr>
      ${divTot||divCr?`<tr><td>Dividends received</td><td class="num">${fmt$(divTot/12)}</td><td class="num">${fmt$(divTot)}</td></tr>
      <tr><td>Franking credits (grossed up)</td><td class="num">${fmt$(divCr/12)}</td><td class="num">${fmt$(divCr)}</td></tr>`:''}
      ${fpTot?`<tr><td>Fund distributions (cash)</td><td class="num">${fmt$(fpTot/12)}</td><td class="num">${fmt$(fpTot)}</td></tr>`:''}
      ${fundAssess?`<tr><td>Fund assessable income (ATO labels)</td><td class="num">${fmt$(fundAssess/12)}</td><td class="num">${fmt$(fundAssess)}</td></tr>`:''}
      ${rentalTotForSummary?`<tr><td>Rental income (property assets)</td><td class="num">${fmt$(rentalTotForSummary/12)}</td><td class="num">${fmt$(rentalTotForSummary)}</td></tr>`:''}
      <tr class="tot"><td>Total assessable income</td><td class="num"><b>${fmt$(assessTotal/12)}</b></td><td class="num"><b>${fmt$(assessTotal)}</b></td></tr>
    </tbody></table>
    <div class="grid3" style="margin-top:14px">
      <div class="stat good"><div class="l">Monthly income avg.</div><div class="v">${fmt$0(assessTotal/12)}</div></div>
      <div class="stat"><div class="l">Yearly assessable total</div><div class="v">${fmt$0(assessTotal)}</div></div>
      <div class="stat bad"><div class="l">Tax withheld (salary)</div><div class="v">${fmt$0(incWh)}</div></div>
    </div>
  </div></div>`);
  /* ---- Monthly income chart (clickable — click a bar to see breakdown) ---- */
  const pid2=isAll()?DB.people[0].id:DB.currentPid;
  const incomeMo=incomeMonthlyForFY(B,pid2);
  const incomeChartData=FY_MONTHS.map((label,i)=>({label,value:incomeMo[i]||0,onClick:`incomeMonthBreakdown(${i})`}));
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="chead"><h2>Monthly income — ${esc(fyDisplay(y))}</h2><span class="hint">click a bar to see the breakdown for that month</span></div>
    <div class="cbody">${barChartSVGClickable(incomeChartData,{aria:'Monthly income',color:'var(--euc)'})}</div></div>`);
};
const REC_MULT={weekly:52,fortnightly:26,monthly:12,quarterly:4,yearly:1,once:1};
const REC_PERIOD_LABEL={weekly:'week',fortnightly:'fortnight',monthly:'month',quarterly:'quarter',yearly:'year',once:'one-off'};
function incMult(rec){return REC_MULT[rec]||12;}
/* Variant of barChartSVG where each bar is clickable — data items may have onClick handler */
function barChartSVGClickable(data,opts){
  opts=opts||{};
  if(!data||!data.length)return '<div class="muted">No data yet.</div>';
  const compact=opts.compact;
  const W=compact?500:620,H=compact?150:200,padL=8,padB=compact?22:26,padT=compact?22:14;
  const color1=opts.color||'var(--euc)';
  const max=Math.max(1,...data.map(d=>num(d.value)+num(d.value2)));
  const bw=(W-padL*2)/data.length;
  let bars='';
  data.forEach((d,i)=>{
    const v1=num(d.value),v2=num(d.value2);
    const h1=(H-padB-padT)*v1/max,h2=(H-padB-padT)*v2/max;
    const x=padL+i*bw+bw*0.14,w=bw*0.72;
    const clickAttr=d.onClick?` onclick="${d.onClick}" style="cursor:pointer" tabindex="0" role="button" aria-label="${esc(d.label)}: ${fmt$(v1)}"`:'' ;
    if(i%2===1)bars+=`<rect x="${padL+i*bw}" y="${padT}" width="${bw}" height="${H-padT-padB}" fill="var(--line2)" opacity=".22"/>`;
    if(v2)bars+=`<rect x="${x}" y="${H-padB-h1-h2}" width="${w}" height="${h2}" rx="2" fill="var(--gold)" opacity=".85"><title>${esc(d.label)}: ${fmt$(v2)}</title></rect>`;
    bars+=`<g${clickAttr}><rect x="${x}" y="${H-padB-h1}" width="${w}" height="${Math.max(h1,v1>0?1.5:0)}" rx="2" fill="${color1}" opacity=".92"><title>${esc(d.label)}: ${fmt$(v1)}</title></rect></g>`;
    if(v1+v2>0)bars+=`<text class="vlab" x="${x+w/2}" y="${H-padB-h1-h2-4}" text-anchor="middle" style="font-size:${compact?.5:.62}rem">${chartFmt(v1+v2)}</text>`;
    bars+=`<text class="axis" x="${x+w/2}" y="${H-padB+15}" text-anchor="middle" style="font-size:${compact?.55:.6}rem">${esc(d.label)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria||'Bar chart')}">
    <line x1="${padL}" y1="${H-padB}" x2="${W-padL}" y2="${H-padB}" stroke="var(--line2)"/>
    ${bars}</svg></div>`;
}
function incomeMonthBreakdown(monthIdx){
  const y=FY(),B=PD();
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const monthLabel=FY_MONTHS[monthIdx];
  const {yr:calYear,mo:calMo}=fyMonthYM(y,monthIdx);
  const mStart=`${calYear}-${String(calMo+1).padStart(2,'0')}-01`;
  const mEnd=iso(new Date(Date.UTC(calYear,calMo+1,1)));

  // Collect income sources for this month
  const rows=[];
  // Salary/recurring incomes — spread evenly by recurrence
  (B.incomes||[]).forEach(r=>{
    const mo=incomeMonthlyForFY(B,pid)[monthIdx];
    if(!mo)return;
    // Check if this income contributes to this month (all recurring do; one-off only if in this month)
    const rec=r.recurrence||'monthly';
    const mult=REC_MULT[rec]||12;
    const perPeriod=num(r.yearly)/mult;
    if(rec==='once'||rec==='yearly'){
      if(!r.date||r.date<mStart||r.date>=mEnd)return;
      rows.push({name:esc(r.name),amount:num(r.yearly),detail:rec==='once'?'one-off':esc(r.kind)});
    } else {
      rows.push({name:esc(r.name),amount:perPeriod,detail:esc(REC_PERIOD_LABEL[rec]||rec)+' salary'});
    }
  });
  // Dividends in this month
  (B.dividends||[]).forEach(d=>{
    if(!d.date||d.date<mStart||d.date>=mEnd)return;
    rows.push({name:`${esc(d.code)} dividend`,amount:num(d.payment)+(num(d.frankingCredit)||0),detail:`${fmtDate(d.date)}${d.frankingCredit?` + ${fmt$(d.frankingCredit)} franking`:''}` });
  });
  // Fund distributions in this month
  (B.fundPayments||[]).forEach(p=>{
    if(!p.date||p.date<mStart||p.date>=mEnd)return;
    rows.push({name:`${esc(p.code)} distribution`,amount:num(p.amount),detail:fmtDate(p.date)});
  });
  // Rental income for this month (from property assets)
  const propAssets=(typeof assetsForPerson==='function')?assetsForPerson([pid]).filter(a=>a.kind==='property'):[];
  propAssets.forEach(a=>{
    const rentM=rentalIncomeMonthlyForFY(a,y);
    if(rentM[monthIdx]>0)rows.push({name:esc(a.name||'Rental income'),amount:rentM[monthIdx],detail:'Rental income'});
  });

  const total=rows.reduce((s,r)=>s+r.amount,0);
  const tableRows=rows.length
    ?rows.sort((a,b)=>b.amount-a.amount).map(r=>`<tr><td>${r.name}</td><td class="muted" style="font-size:.82rem">${r.detail}</td><td class="num" style="color:var(--euc);font-weight:600">${fmt$(r.amount)}</td></tr>`).join('')
    :'<tr><td colspan="3" class="muted">No income recorded for this month.</td></tr>';

  modal(`${monthLabel} income breakdown`,`
    <table class="tbl"><thead><tr><th>Source</th><th>Detail</th><th class="num">Amount</th></tr></thead>
    <tbody>${tableRows}
    ${total?`<tr class="total"><td>Total</td><td></td><td class="num">${fmt$(total)}</td></tr>`:''}
    </tbody></table>`,
    `<button class="btn primary" data-close>Close</button>`);
}
function round2(n){return Math.round(n*100)/100;}
function incRecOptionsUpdate(){
  const sel=$('#f_amode');if(!sel)return;
  const rec=$('#f_rec').value;
  const opt=sel.querySelector('option[value="period"]');
  if(opt)opt.textContent='per '+(REC_PERIOD_LABEL[rec]||'period');
}
function rentalOverrideEdit(assetId){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  const y=FY();
  const calc=rentalIncomeForFY(a,y);
  const cur=a.rentalOverrides&&a.rentalOverrides[String(y.startYear)];
  modal(`Override rental income — ${esc(fyDisplay(y))}`,`
    <div class="hint">Calculated from rate history: <b>${fmt$(calc)}</b>. Enter the actual amount received for ${esc(fyDisplay(y))} if it differs.</div>
    <div class="fldrow mt"><div><label class="fld">Actual rental income ($) for ${esc(fyDisplay(y))}</label><input id="f_rov" class="input money" value="${cur??''}" placeholder="${calc}"></div></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="rentalOverrideSave('${assetId}')">Save override</button>`);
}
function rentalOverrideSave(assetId){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  const y=FY();
  const v=$('#f_rov').value;
  a.rentalOverrides=a.rentalOverrides||{};
  if(v===''){delete a.rentalOverrides[String(y.startYear)];}
  else a.rentalOverrides[String(y.startYear)]=num(v);
  save();closeModal();render();toast('Rental income override saved');
}
function rentalOverrideClear(assetId){
  const a=DB.assets.find(x=>x.id===assetId);if(!a||!a.rentalOverrides)return;
  delete a.rentalOverrides[String(FY().startYear)];
  save();render();toast('Override cleared — using calculated figure');
}
function incAmountPreview(){
  const hint=$('#incAmountHint');if(!hint)return;
  const amt=num($('#f_y').value),mode=$('#f_amode').value,rec=$('#f_rec').value;
  if(!amt){hint.textContent='';return;}
  if(mode==='period')hint.textContent=`= ${fmt$0(amt*incMult(rec))}/yr`;
  else hint.textContent=(rec!=='yearly'&&rec!=='once')?`= ${fmt$0(amt/incMult(rec))}/${REC_PERIOD_LABEL[rec]}`:'';
}
function incSuperPreview(){
  const sp=$('#incSuperPreview');if(!sp)return;
  const cb=$('#f_super');if(!cb||!cb.checked){sp.textContent='';return;}
  const amt=num($('#f_y').value),mode=$('#f_amode')?$('#f_amode').value:'yearly',rec=$('#f_rec').value;
  const yearly=mode==='period'?amt*incMult(rec):amt;
  const sgEl=$('#incSuperRateLabel');
  const rate=sgEl?num(sgEl.textContent):(FY().rates.superSGRate||11.5);
  sp.textContent=yearly?` → employer SG ~${fmt$0(yearly*rate/100)}/yr`:'';
}
function incAmountModeChange(){
  const sel=$('#f_amode'),amt=num($('#f_y').value),rec=$('#f_rec').value;
  const prevMode=sel.dataset.prev||'yearly',newMode=sel.value;
  const yearly=prevMode==='period'?amt*incMult(rec):amt;
  $('#f_y').value=round2(newMode==='period'?yearly/incMult(rec):yearly);
  sel.dataset.prev=newMode;
  incAmountPreview();
}
function incRecChange(v){
  const show=v==='once'||v==='yearly';
  const el=$('#incDateRow');if(el)el.style.display=show?'flex':'none';
  // Keep the displayed amount meaningful across a recurrence change: convert
  // to yearly using the OLD recurrence's multiplier, then back to the
  // current mode using the NEW recurrence's multiplier.
  const recSel=$('#f_rec'),amode=$('#f_amode');
  const prevRec=recSel.dataset.prev||'monthly';
  if(amode&&amode.value==='period'){
    const amt=num($('#f_y').value);
    const yearly=amt*incMult(prevRec);
    $('#f_y').value=round2(yearly/incMult(v));
  }
  recSel.dataset.prev=v;
  incRecOptionsUpdate();
  incAmountPreview();
}
function preTaxDedAdd(i){
  if(lockedGuard())return;
  const B=PD(),r=i!=null?B.preTaxDeds[i]:{name:'',type:PRETAX_DED_TYPES[0],yearly:'',recurrence:'monthly',schedDay:'',date:'',incomeId:''};
  const rec=r.recurrence||'monthly';
  const vehicleOpts=assetsForPerson([DB.currentPid]).filter(a=>a.kind==='vehicle').map(a=>`<option value="${a.id}" ${r.vehicleId===a.id?'selected':''}>${esc(a.name)}</option>`).join('');
  const novatedDisplay=r.type==='Novated lease'?'block':'none';
  const paLeaveDisplay=r.type==='Purchased annual leave'?'flex':'none';
  // Income source options for linking
  const incomeOpts=B.incomes.map(inc=>`<option value="${inc.id}" ${r.incomeId===inc.id?'selected':''}>${esc(inc.name)}</option>`).join('');
  modal(i!=null?'Edit pre-tax deduction':'Add pre-tax deduction',`
    <div class="fldrow"><div><label class="fld">Type</label><select id="f_k" class="input" onchange="if(this.value!=='Other salary sacrifice'&&(!$('#f_n').value||PRETAX_DED_TYPES.includes($('#f_n').value)))$('#f_n').value=this.value;preTaxDedTypeChange(this.value)">${PRETAX_DED_TYPES.map(t=>`<option ${(r.type||PRETAX_DED_TYPES[0])===t?'selected':''}>${t}</option>`).join('')}</select></div>
    <div style="flex:2"><label class="fld">Label</label><input id="f_n" class="input" value="${esc(r.name||r.type||PRETAX_DED_TYPES[0])}" placeholder="e.g. Super salary sacrifice"></div></div>
    ${incomeOpts?`<div class="fldrow mt"><div style="flex:2"><label class="fld">Linked income source <span class="muted">(optional — for net pay display in recent activity)</span></label>
      <select id="f_inc" class="input"><option value="">— not linked —</option>${incomeOpts}</select></div></div>`:''}
    <div id="paLeaveFlds" class="fldrow mt" style="display:${paLeaveDisplay}">
      <div><label class="fld">Weeks purchased</label><input id="f_paweeks" class="input money" value="${r.leaveWeeks||''}" placeholder="e.g. 2" oninput="purchasedLeavePreview()"></div>
      <div><label class="fld">Weekly salary rate ($) <span class="muted">before tax</span></label><input id="f_parate" class="input money" value="${r.leaveRate||''}" placeholder="e.g. 1500" oninput="purchasedLeavePreview()"></div>
    </div>
    <div class="hint mt" id="paLeaveHint" style="display:${paLeaveDisplay}">Buying leave reduces your salary by the equivalent amount — fills in the amount below automatically.</div>
    <div class="fldrow mt">
      <div style="flex:2"><label class="fld">Amount ($) <span class="muted" id="incAmountHint"></span></label>
        <div style="display:flex;gap:8px">
          <input id="f_y" class="input money" value="${r.yearly}" oninput="incAmountPreview()" style="flex:1">
          <select id="f_amode" class="input" style="width:auto" onchange="incAmountModeChange()" data-prev="yearly">
            <option value="yearly">per year</option>
            <option value="period">per ${esc(REC_PERIOD_LABEL[rec]||'period')}</option>
          </select>
        </div>
      </div>
      <div><label class="fld">Recurrence</label><select id="f_rec" class="input" onchange="incRecChange(this.value)" data-prev="${esc(rec)}">
        ${RECURRENCE_OPTS.map(([v,l])=>`<option value="${v}" ${rec===v?'selected':''}>${l}</option>`).join('')}</select></div>
    </div>
    <div class="fldrow mt"><div><label class="fld">Day of month <span class="muted">(monthly/ftn)</span></label><input id="f_dm" class="input money" value="${r.schedDay||''}" placeholder="e.g. 15"></div>
    <div id="incDateRow" class="fldrow" style="display:${(rec==='once'||rec==='yearly')?'flex':'none'};flex:2"><div><label class="fld">Payment date</label><input id="f_dt" type="date" class="input" value="${r.date||''}"></div></div></div>
    <div id="novatedFlds" style="display:${novatedDisplay}" class="mt">
      <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
      <div class="fldrow"><div style="flex:2"><label class="fld">Linked vehicle</label><select id="f_veh" class="input" onchange="novatedVehicleChange(this.value)">
        <option value="">— none —</option>
        ${vehicleOpts}
        <option value="__new__">+ Create new vehicle…</option>
      </select></div></div>
      <div id="novatedNewVehFlds" style="display:none" class="mt"><label class="fld">New vehicle name</label><input id="f_newveh" class="input" placeholder="e.g. Tesla Model 3"></div>
      <div class="fldrow mt">
        <div><label class="fld">Lease start date</label><input id="f_lsd" type="date" class="input" value="${r.leaseStartDate||''}" oninput="novatedLeasePreview()"></div>
        <div><label class="fld">Lease duration</label><select id="f_ldur" class="input" onchange="novatedLeasePreview()">
          ${[1,2,3,4,5].map(n=>`<option value="${n}" ${(r.leaseDurationYears||3)===n?'selected':''}>${n} year${n>1?'s':''}</option>`).join('')}
        </select></div>
        <div><label class="fld">Residual / buy-out ($) <span class="muted">optional</span></label>
          <input id="f_residual" class="input money" value="${r.residualAmount||''}" placeholder="e.g. 8500"></div>
      </div>
      <div id="leaseEndPreview" class="hint mt" style="margin-top:4px"></div>
      <div class="mt"><label class="fld">Expenses included in this lease <span class="muted">(won't be double-counted as separate deductions)</span></label>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
          ${VEHICLE_CATS.filter(c=>c!=='Other').map(c=>`<label style="display:flex;gap:5px;align-items:center;font-size:.84rem"><input type="checkbox" class="novated-cat" value="${c}" ${(r.includedExpenseCategories||[]).includes(c)?'checked':''}> ${esc(c)}</label>`).join('')}
        </div>
      </div>
      <div class="hint mt">If this is a "fully maintained" novated lease that bundles running costs into your salary-sacrifice amount, tick those categories so they aren't also claimed as separate vehicle expense deductions.</div>
    </div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="preTaxDedSave(${i==null?'null':i})">Save</button>`);
  if(r.type==='Novated lease')setTimeout(novatedLeasePreview,50);
}
function preTaxDedTypeChange(v){
  const el=$('#novatedFlds');if(el)el.style.display=v==='Novated lease'?'block':'none';
  const pl=$('#paLeaveFlds'),plh=$('#paLeaveHint');
  if(pl)pl.style.display=v==='Purchased annual leave'?'flex':'none';
  if(plh)plh.style.display=v==='Purchased annual leave'?'block':'none';
  if(v==='Novated lease')setTimeout(novatedLeasePreview,50);
}
/* Buying back annual leave reduces gross salary by weeks × weekly rate —
   compute that and write it straight into the main amount field so the
   user doesn't need to do the multiplication themselves. */
function purchasedLeavePreview(){
  const wEl=$('#f_paweeks'),rEl=$('#f_parate'),yEl=$('#f_y'),modeEl=$('#f_amode');
  if(!wEl||!rEl||!yEl)return;
  const weeks=num(wEl.value),rate=num(rEl.value);
  if(weeks&&rate){
    if(modeEl)modeEl.value='yearly';
    yEl.value=round2(weeks*rate);
    incAmountPreview();
  }
}
function novatedVehicleChange(v){
  const el=$('#novatedNewVehFlds');if(el)el.style.display=v==='__new__'?'block':'none';
}
/* Returns the lease end date ISO string, or null if not enough info */
function leaseEndDate(r){
  if(!r.leaseStartDate||!r.leaseDurationYears)return null;
  const d=new Date(r.leaseStartDate+'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear()+num(r.leaseDurationYears));
  return iso(d);
}
/* Countdown text: "8 months away" / "2 weeks ago" */
function leaseCountdown(endDate){
  if(!endDate)return '';
  const diffMs=new Date(endDate+'T00:00:00Z')-Date.now();
  const diffDays=Math.round(diffMs/86400000);
  if(Math.abs(diffDays)<1)return 'today';
  if(diffDays>0){
    if(diffDays<7)return `${diffDays}d away`;
    if(diffDays<60)return `${Math.round(diffDays/7)}w away`;
    return `${Math.round(diffDays/30)}mo away`;
  }
  const ago=Math.abs(diffDays);
  if(ago<7)return `${ago}d ago`;
  if(ago<60)return `${Math.round(ago/7)}w ago`;
  return `${Math.round(ago/30)}mo ago`;
}
function novatedLeasePreview(){
  const el=$('#leaseEndPreview');if(!el)return;
  const start=$('#f_lsd')?.value;
  const dur=num($('#f_ldur')?.value||3);
  if(!start){el.textContent='';return;}
  const fake={leaseStartDate:start,leaseDurationYears:dur};
  const end=leaseEndDate(fake);
  if(!end){el.textContent='';return;}
  el.textContent=`Lease ends ${fmtDate(end)} · ${leaseCountdown(end)}`;
}
function preTaxDedSave(i){
  const rec=$('#f_rec').value||'monthly';
  const amt=num($('#f_y').value);
  const mode=$('#f_amode')?$('#f_amode').value:'yearly';
  const yearly=mode==='period'?round2(amt*incMult(rec)):amt;
  const B=PD();
  const r={id:i!=null?B.preTaxDeds[i].id:uid(),name:$('#f_n').value.trim()||$('#f_k').value,type:$('#f_k').value,yearly,
    recurrence:rec,schedDay:$('#f_dm').value||'',date:$('#f_dt').value||'',recurring:rec!=='once',
    incomeId:$('#f_inc')?$('#f_inc').value||'':''};
  if(r.type==='Purchased annual leave'){
    r.leaveWeeks=num($('#f_paweeks')?.value)||'';
    r.leaveRate=num($('#f_parate')?.value)||'';
  }
  if(r.type==='Novated lease'){
    let vehicleId=$('#f_veh')?$('#f_veh').value:'';
    if(vehicleId==='__new__'){
      const name=$('#f_newveh')?$('#f_newveh').value.trim():'';
      const a={id:uid(),pid:DB.currentPid,name:name||'Leased vehicle',kind:'vehicle',costs:[],transactions:[],odometer:[],purchaseDate:'',purchasePrice:'',depreciationRate:15};
      DB.assets.push(a);
      vehicleId=a.id;
    }
    r.vehicleId=vehicleId||'';
    r.includedExpenseCategories=$$('.novated-cat').filter(c=>c.checked).map(c=>c.value);
    r.leaseStartDate=$('#f_lsd')?$('#f_lsd').value||'':'';
    r.leaseDurationYears=$('#f_ldur')?num($('#f_ldur').value)||3:3;
    r.residualAmount=$('#f_residual')?num($('#f_residual').value)||0:0;
  }
  if(i!=null)B.preTaxDeds[i]=r;else B.preTaxDeds.push(r);
  save();closeModal();render();toast('Pre-tax deduction saved');
}
function incomeAdd(i){
  if(lockedGuard())return;
  const y=FY(),B=PD(),r=i!=null?B.incomes[i]:{name:'',kind:'Salary / wages',yearly:'',taxWithheld:'',recurrence:'monthly',schedDay:'',date:''};
  const rec=r.recurrence||'monthly';
  modal(i!=null?'Edit income':'Add income',`
    <div class="fldrow"><div><label class="fld">Source name</label><input id="f_n" class="input" value="${esc(r.name)}" placeholder="e.g. Main job salary"></div>
    <div><label class="fld">Type</label><select id="f_k" class="input">${['Salary / wages','Allowance','Bonus','Rental income','Bank interest','Business / side income','Other'].map(k=>`<option ${r.kind===k?'selected':''}>${k}</option>`).join('')}</select></div></div>
    <div class="fldrow mt">
      <div style="flex:2"><label class="fld">Amount ($) <span class="muted" id="incAmountHint"></span></label>
        <div style="display:flex;gap:8px">
          <input id="f_y" class="input money" value="${r.yearly}" oninput="incAmountPreview();incSuperPreview()" style="flex:1">
          <select id="f_amode" class="input" style="width:auto" onchange="incAmountModeChange()" data-prev="yearly">
            <option value="yearly">per year</option>
            <option value="period">per ${esc(REC_PERIOD_LABEL[rec]||'period')}</option>
          </select>
        </div>
      </div>
      <div><label class="fld">Tax withheld over the year ($)</label><input id="f_w" class="input money" value="${r.taxWithheld||''}"></div>
    </div>
    <div class="fldrow mt">
      <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="f_super" ${r.attractsSuper?'checked':''} onchange="incSuperPreview()"> <span>Attracts super (SG @ <b id="incSuperRateLabel">${y.rates.superSGRate||11.5}%</b>)</span></label>
      <span id="incSuperPreview" class="muted" style="font-size:.83rem"></span>
    </div>
    <div class="fldrow mt"><div><label class="fld">Recurrence</label><select id="f_rec" class="input" onchange="incRecChange(this.value)" data-prev="${esc(rec)}">
      ${RECURRENCE_OPTS.map(([v,l])=>`<option value="${v}" ${rec===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div><label class="fld">Day of month <span class="muted">(monthly/ftn)</span></label><input id="f_dm" class="input money" value="${r.schedDay||''}" placeholder="e.g. 15"></div></div>
    <div id="incDateRow" style="display:${(rec==='once'||rec==='yearly')?'flex':'none'};gap:12px" class="fldrow mt">
      <div><label class="fld">Payment date</label><input id="f_dt" type="date" class="input" value="${r.date||''}"></div></div>
    ${i!=null?`<div class="hint mt">${r.receiptId?`📎 Statement attached: ${esc(r.receiptName||'file')} — <a href="#" onclick="closeModal();incomeAttachOpen('${r.id}');return false">replace or remove</a>`:`<a href="#" onclick="closeModal();incomeAttachOpen('${r.id}');return false">+ Attach a statement</a> (e.g. EOY salary summary, bank interest statement)`}</div>`:''}`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="incomeSave(${i==null?'null':i})">Save</button>`);
}
function incomeAttachOpen(id){
  const r=PD().incomes.find(x=>x.id===id);
  if(!r)return;
  const isMonthly=r.recurrence==='monthly'||r.recurrence==='fortnightly';
  const monthOpts=isMonthly?`
    <div class="mt"><label class="fld">Statement type</label>
      <select id="f_stmt_kind" class="input" style="width:auto" onchange="incomeAttachTypeChange()">
        <option value="eoy">End-of-year summary</option>
        <option value="monthly">Monthly statement</option>
      </select></div>
    <div id="incMonthRow" class="mt" style="display:none"><label class="fld">Statement month</label>
      <input id="f_stmt_month" type="month" class="input" style="max-width:200px"></div>`:
    '';
  modal('Attach statement',`
    <div class="hint">Attach the document this income relates to — an EOY salary summary, bank interest statement, payslip, or similar.${isMonthly?' You can attach a single monthly payslip or statement for a specific month, or an end-of-year summary.':''}</div>
    <div class="mt"><label class="fld">File ${r.receiptId?'(replaces existing)':''}</label><input id="f_rcpt" type="file" class="input" accept="image/*,.pdf,.csv,.xlsx,.xls"></div>
    ${monthOpts}`,
    `<button class="btn" data-close>Cancel</button>${r.receiptId?`<button class="btn ghost" onclick="incomeDetachStatement('${id}')">Remove</button>`:''}<button class="btn primary" onclick="incomeAttachSave('${id}')">Attach</button>`);
}
function incomeAttachTypeChange(){
  const sel=$('#f_stmt_kind');
  const row=$('#incMonthRow');
  if(sel&&row)row.style.display=sel.value==='monthly'?'block':'none';
}
async function incomeAttachSave(id){
  const r=PD().incomes.find(x=>x.id===id);
  if(!r)return;
  const file=$('#f_rcpt')?.files[0];
  if(!file)return toast('Choose a file first');
  const oldRid=r.receiptId;
  r.receiptId=uid();r.receiptName=file.name;
  closeModal();save();render();
  toast('Attaching…');
  try{
    await rcptPut({id:r.receiptId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(FY()),category:'Income',date:r.date||todayISO(),itemName:r.name,pid:isAll()?DB.people[0].id:DB.currentPid});
    if(oldRid&&!receiptStillReferenced(oldRid))await rcptDel(oldRid).catch(()=>{});
    toast('Statement attached');render();
  }catch(e){toast("Couldn't attach statement — try again");}
}
function incomeDetachStatement(id){
  const r=PD().incomes.find(x=>x.id===id);
  if(!r)return;
  const rid=r.receiptId;
  r.receiptId='';r.receiptName='';
  closeModal();save();render();
  if(rid&&!receiptStillReferenced(rid))rcptDel(rid).catch(()=>{});
  toast('Attachment removed');
}
function incomeDeleteRow(i){
  const r=PD().incomes[i];
  if(!r)return;
  PD().incomes.splice(i,1);
  if(r.receiptId&&!receiptStillReferenced(r.receiptId))rcptDel(r.receiptId).catch(()=>{});
  save();render();
}
function incomeSave(i){
  const rec=$('#f_rec').value||'monthly';
  const amt=num($('#f_y').value);
  const mode=$('#f_amode')?$('#f_amode').value:'yearly';
  const yearly=mode==='period'?round2(amt*incMult(rec)):amt;
  const prev=i!=null?PD().incomes[i]:null;
  const r={id:prev?prev.id:uid(),name:$('#f_n').value.trim()||'Income',kind:$('#f_k').value,yearly,
    taxWithheld:num($('#f_w').value),recurrence:rec,schedDay:$('#f_dm').value||'',
    date:$('#f_dt').value||'',recurring:rec!=='once',attractsSuper:!!($('#f_super')?.checked)};
  if(prev&&prev.receiptId){r.receiptId=prev.receiptId;r.receiptName=prev.receiptName;}
  if(i!=null)PD().incomes[i]=r;else PD().incomes.push(r);
  save();closeModal();render();toast('Income saved');
}

/* ================= SHARE DIVIDENDS ================= */
PAGES.dividends=m=>{
  const y=FY(),B=PD();
  B.dividends.forEach(d=>{if(!d.id)d.id=uid();});
  DIV_SELECTED=new Set([...DIV_SELECTED].filter(id=>B.dividends.some(d=>d.id===id)));
  head(m,'Share dividends',`Each payment with its franked / unfranked split. Franking credits are added to assessable income and offset tax in the FY summary.`,
    `${DIV_SELECTED.size?`<button class="btn danger" onclick="divDeleteSelected()">🗑 Delete ${DIV_SELECTED.size} selected</button>`:''}<button class="btn" onclick="divImportOpen()">⇪ Import CSV</button><button class="btn primary" onclick="divAdd()">+ Add dividend</button>`);
  const importPanel=divImportPanel();
  if(importPanel)m.insertAdjacentHTML('beforeend',importPanel);
  const groups={};
  B.dividends.forEach((d,i)=>{(groups[d.code]=groups[d.code]||[]).push({...d,_i:i});});
  const codes=Object.keys(groups).sort();
  let body='';
  const T={pay:0,unf:0,frk:0,cr:0};
  const pieData=[];
  codes.forEach(c=>{
    const rows=groups[c].sort((a,b)=>a.date<b.date?-1:1);
    const t=rows.reduce((s,d)=>({pay:s.pay+num(d.payment),unf:s.unf+num(d.unfranked),frk:s.frk+num(d.franked),cr:s.cr+num(d.frankingCredit)}),{pay:0,unf:0,frk:0,cr:0});
    T.pay+=t.pay;T.unf+=t.unf;T.frk+=t.frk;T.cr+=t.cr;
    if(t.pay>0)pieData.push({label:c,value:t.pay});
    const expanded=rows.length<2||DIV_EXPANDED.has(c);
    const missingCount=rows.filter(d=>!d.receiptId).length;
    body+=`<tr class="subhead" ${rows.length>1?`style="cursor:pointer" onclick='divGroupToggle(${JSON.stringify(c)})'`:''}><td></td><td>${rows.length>1?`<span style="display:inline-block;width:1em">${expanded?'▾':'▸'}</span>`:''}<b>${esc(c)}</b> <span class="muted" style="font-weight:400;font-size:.78rem">(${rows.length})</span>${missingCount?` <span class="badge gold" style="font-size:.68rem" title="${missingCount} payment${missingCount===1?'':'s'} missing a statement">⚠ ${missingCount}</span>`:''}</td><td>${rows[0].platform?platformPill(rows[0].platform):''}</td><td>YTD</td>
      <td class="num">${fmt$(t.pay)}</td><td class="num">${fmt$(t.unf)}</td><td class="num">${fmt$(t.frk)}</td><td class="num">${fmt$(t.cr)}</td><td></td></tr>`;
    if(expanded)body+=rows.map(d=>`<tr>
      <td><input type="checkbox" ${DIV_SELECTED.has(d.id)?'checked':''} onchange="divToggleSelect('${d.id}',this.checked)"></td>
      <td></td><td>${d.platform?platformPill(d.platform):''}</td><td>${fmtDate(d.date)}</td>
      <td class="num">${fmt$(d.payment)}</td><td class="num">${fmt$(d.unfranked)}</td><td class="num">${fmt$(d.franked)}</td><td class="num">${fmt$(d.frankingCredit)}</td>
      <td class="rowact">${d.receiptId?`<span class="rcpt-file" onclick="rcptView('${d.receiptId}','${esc(d.code)} dividend')" title="${esc(d.receiptName||'statement')}">📎</span>`:`<span class="badge gold" style="cursor:pointer;font-size:.68rem" onclick="divAttachOpen('${d.id}')" title="No statement attached — click to attach one">⚠ no attachment</span>`}
      <button class="btn ghost small" onclick="divAdd(${d._i})">Edit</button>
      <button class="btn ghost small" onclick="if(!lockedGuard())confirmDel('Delete this payment?',()=>divDeleteRow(${d._i}))">✕</button></td></tr>`).join('');
  });
  const months=FY_MONTHS.map(l=>({label:l,value:0,value2:0}));
  B.dividends.forEach(d=>{if(d.date){const i=monthIndexFY(d.date);months[i].value+=num(d.payment);months[i].value2+=num(d.frankingCredit);}});
  m.insertAdjacentHTML('beforeend',`
  <div class="card"><div class="chead"><h2>Dividend income by month</h2><span class="hint"><span class="badge euc">cash</span> <span class="badge gold">franking credits</span></span></div>
    <div class="cbody">${barChartSVG(months,{aria:'Dividend income by month',label2:'franking credits'})}</div></div>
  ${pieData.length?`<div class="card"><div class="chead"><h2>Total payment by security</h2></div>
    <div class="cbody">${pieChartSVG(pieData,{aria:'Total dividend payment by security'})}</div></div>`:''}
  <div class="card"><div class="cbody tight"><table class="tbl">
    <thead><tr><th><input type="checkbox" ${B.dividends.length&&DIV_SELECTED.size===B.dividends.length?'checked':''} onchange="divToggleSelectAll(this.checked)" title="Select all"></th><th>Security</th><th>Platform</th><th>Date</th><th class="num">Total payment</th><th class="num">Unfranked</th><th class="num">Franked</th><th class="num">Franking credit</th><th></th></tr></thead>
    <tbody>${body||'<tr><td colspan="9" class="muted">No dividends yet for this year.</td></tr>'}
    <tr class="total"><td colspan="4">Totals</td><td class="num">${fmt$(T.pay)}</td><td class="num">${fmt$(T.unf)}</td><td class="num">${fmt$(T.frk)}</td><td class="num">${fmt$(T.cr)}</td><td></td></tr></tbody></table></div></div>
    <div class="note">Franking credit helper: a fully franked amount carries credits of <b>franked × 30 ⁄ 70</b>. The add form pre-fills this — adjust it to match your statement. Manage the platform list in Tax settings.</div>`);
};
let DIV_SELECTED=new Set(); // ids of dividends ticked for mass-delete, transient
let DIV_EXPANDED=new Set(); // security codes currently expanded, transient — collapsed by default
function divGroupToggle(code){
  if(DIV_EXPANDED.has(code))DIV_EXPANDED.delete(code);else DIV_EXPANDED.add(code);
  render();
}
function divToggleSelect(id,checked){
  if(checked)DIV_SELECTED.add(id);else DIV_SELECTED.delete(id);
  render();
}
function divToggleSelectAll(checked){
  if(checked)PD().dividends.forEach(d=>DIV_SELECTED.add(d.id));
  else DIV_SELECTED.clear();
  render();
}
function divDeleteSelected(){
  if(!DIV_SELECTED.size||lockedGuard())return;
  const n=DIV_SELECTED.size;
  confirmDel(`Delete ${n} selected payment${n===1?'':'s'}? This can't be undone.`,()=>{
    const toDelete=PD().dividends.filter(d=>DIV_SELECTED.has(d.id));
    PD().dividends=PD().dividends.filter(d=>!DIV_SELECTED.has(d.id));
    const seenReceipts=new Set();
    toDelete.forEach(d=>{
      if(d.receiptId&&!seenReceipts.has(d.receiptId)){
        seenReceipts.add(d.receiptId);
        const stillUsed=Object.values(DB.years).some(y=>Object.values(y.people||{}).some(b=>(b.dividends||[]).some(x=>x.receiptId===d.receiptId)));
        if(!stillUsed)rcptDel(d.receiptId).catch(()=>{});
      }
    });
    DIV_SELECTED.clear();save();render();toast(`Deleted ${n} payment${n===1?'':'s'}`);
  });
}
function divAssetPick(assetId){
  if(!assetId)return;
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  if(a.code&&$('#f_c'))$('#f_c').value=a.code;
  if(a.platform&&$('#f_p')&&!$('#f_p').value)$('#f_p').value=a.platform;
}
function divAdd(i){
  if(lockedGuard())return;
  const y=FY(),B=PD();
  let d=i!=null?B.dividends[i]:{code:'',platform:(DB.platforms||[])[0]||'',date:todayISO(),payment:'',unfranked:'',franked:'',frankingCredit:'',qty:''};
  const shareAssets=(typeof assetsForPerson==='function')?assetsForPerson([DB.currentPid]).filter(a=>a.kind==='shares'):[];
  // Warn if no share assets exist
  if(i==null&&!shareAssets.length){
    modal('Add dividend',`
      <div style="text-align:center;padding:16px 0 8px">
        <div style="font-size:2rem;margin-bottom:10px">📈</div>
        <p style="font-weight:600;font-size:1rem;margin-bottom:8px">Set up your share holding as an asset first</p>
        <p class="muted" style="line-height:1.6">Go to <b>Assets → + Add asset → Shares</b> to register the holding with its ASX code. Once created, you can come back here to log dividend payments against it.</p>
      </div>`,
      `<button class="btn" data-close>Cancel</button>
       <button class="btn primary" onclick="closeModal();go('assets')">Go to Assets ↗</button>`);
    return;
  }
  const sOpts=shareAssets.map(a=>`<option value="${a.id}" ${d.assetId===a.id?'selected':''}>${esc(a.name)}${a.code?' ('+esc(a.code)+')':''}</option>`).join('');
  const linkedShare=d.assetId?shareAssets.find(a=>a.id===d.assetId):shareAssets.length===1?shareAssets[0]:null;
  if(!d.assetId&&linkedShare)d={...d,assetId:linkedShare.id,code:linkedShare.code||d.code};
  modal(i!=null?'Edit dividend':'Add dividend',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Holding</label>
      <select id="f_aid" class="input" onchange="divAssetPick(this.value)"><option value="">— select holding —</option>${sOpts}</select></div>
    <div><label class="fld">Platform</label><input id="f_p" class="input" value="${esc(d.platform)}" list="platforms"><datalist id="platforms">${platOptions()}</datalist></div>
    <div><label class="fld">Payment date</label><input id="f_d" type="date" class="input" value="${d.date}"></div></div>
    <input type="hidden" id="f_c" value="${esc(d.code)}">
    <div class="fldrow mt"><div><label class="fld">Total payment ($)</label><input id="f_t" class="input money" value="${d.payment}" oninput="divAuto()" placeholder="auto = unfranked + franked"></div><div><label class="fld">Shares held on date (optional)</label><input id="f_qty" class="input money" value="${d.qty||''}"></div>
    <div><label class="fld">Unfranked ($)</label><input id="f_u" class="input money" value="${d.unfranked}" oninput="divAuto()"></div>
    <div><label class="fld">Franked ($)</label><input id="f_f" class="input money" value="${d.franked}" oninput="divAuto()"></div>
    <div><label class="fld">Franking credit ($)</label><input id="f_fc" class="input money" value="${d.frankingCredit}"></div></div>
    ${i!=null?`<div class="hint mt">${d.receiptId?`📎 Statement attached: ${esc(d.receiptName||'file')} — <a href="#" onclick="closeModal();divAttachOpen('${d.id}');return false">replace or remove</a>`:`<a href="#" onclick="closeModal();divAttachOpen('${d.id}');return false">+ Attach a statement</a> for this payment`}</div>`:''}`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="divSave(${i==null?'null':i})">Save</button>`);
}
function divAuto(){
  // Total payment = unfranked + franked. Whichever field the person is
  // NOT actively typing in gets recomputed, so editing either "side"
  // keeps the total consistent without fighting their input.
  const t=$('#f_t'),u=$('#f_u'),f=$('#f_f');
  if(document.activeElement===t){
    // Total changed directly — keep unfranked as-is, recompute franked as the remainder
    const newF=Math.max(0,num(t.value)-num(u.value));
    f.value=newF.toFixed(2);
  }else{
    t.value=(num(u.value)+num(f.value)).toFixed(2);
  }
  divCredit();
}
function divCredit(){const f=num($('#f_f').value);$('#f_fc').value=(f*30/70).toFixed(2);}
function divDeleteRow(i){
  const d=PD().dividends[i];
  if(!d)return;
  const rid=d.receiptId;
  PD().dividends.splice(i,1);
  if(rid&&!receiptStillReferenced(rid))rcptDel(rid).catch(()=>{});
  save();render();
}
function divAttachOpen(id){
  const d=PD().dividends.find(x=>x.id===id);
  if(!d)return;
  modal('Attach statement',`
    <div class="hint">Attach the statement this payment came from — the PDF/CSV/XLSX you imported, or a screenshot of the platform's record.</div>
    <div class="mt"><label class="fld">File ${d.receiptId?'(replaces existing)':''}</label><input id="f_rcpt" type="file" class="input" accept="image/*,.pdf,.csv,.xlsx,.xls"></div>`,
    `<button class="btn" data-close>Cancel</button>${d.receiptId?`<button class="btn ghost" onclick="divDetachStatement('${id}')">Remove</button>`:''}<button class="btn primary" onclick="divAttachSave('${id}')">Attach</button>`);
}
async function divAttachSave(id){
  const d=PD().dividends.find(x=>x.id===id);
  if(!d)return;
  const file=$('#f_rcpt')?.files[0];
  if(!file)return toast('Choose a file first');
  const oldRid=d.receiptId;
  d.receiptId=uid();d.receiptName=file.name;
  closeModal();save();render();
  if(oldRid&&!receiptStillReferenced(oldRid))await rcptDel(oldRid).catch(()=>{});
  toast('Attaching…');
  try{
    await rcptPut({id:d.receiptId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(FY()),category:'Dividends',date:d.date,itemName:d.code+' dividend',pid:isAll()?DB.people[0].id:DB.currentPid});
    toast('Statement attached');render();
  }catch(e){toast("Couldn't attach statement — try again");}
}
function divDetachStatement(id){
  const d=PD().dividends.find(x=>x.id===id);
  if(!d)return;
  const rid=d.receiptId;
  d.receiptId='';d.receiptName='';
  if(rid&&!receiptStillReferenced(rid))rcptDel(rid).catch(()=>{});
  closeModal();save();render();toast('Attachment removed');
}
/* Shared check: does this code belong to an existing ETF/Managed Fund asset?
   Used by both the bulk CSV/XLSX dividend import AND the manual single
   "Add dividend" form, so a user can't bypass the protection by typing
   one dividend at a time instead of importing a statement. */
function etfCodeBlocked(code){
  if(!code)return false;
  const c=String(code).trim().toUpperCase();
  if(!c)return false;
  return (DB.assets||[]).some(a=>a.kind==='managed_fund'&&(a.code||'').trim().toUpperCase()===c);
}
function etfBlockModal(codes){
  const codeList=[...new Set(codes.map(c=>c.trim().toUpperCase()))].join(', ');
  modal('ETF / Managed fund detected',`
    <div class="note" style="border-color:var(--gold)">
      <b>This won't be saved as a share dividend — ${codeList} is an ETF / Managed Fund.</b>
    </div>
    <div class="mt">${codeList} already exists in your <b>ETF / Managed Funds</b> section. Managed funds distribute income via <b>AMIT statements</b> which include tax labels (13U, 13C, 18A, etc.) that a simple dividend entry doesn't capture — entering it here as well would double-count the same income.</div>
    <div class="mt">To fix this:
      <ol style="margin:6px 0 0 18px;line-height:1.7">
        <li>Don't enter ${codeList} here as a share dividend</li>
        <li>Go to <a href="#" onclick="closeModal();go('funds');return false">ETF / Managed Funds</a> and use <b>Import AMIT statement</b> (or edit the fund directly) to record this distribution</li>
      </ol>
    </div>`,
    `<button class="btn primary" data-close>OK, got it</button>`);
}
function divSave(i){
  const d={id:i!=null?PD().dividends[i].id:uid(),code:$('#f_c').value.trim().toUpperCase()||'???',platform:$('#f_p').value.trim(),date:$('#f_d').value,
    payment:num($('#f_t').value),unfranked:num($('#f_u').value),franked:num($('#f_f').value),frankingCredit:num($('#f_fc').value),qty:num($('#f_qty').value)||'',
    assetId:$('#f_aid')?$('#f_aid').value:''};
  if(etfCodeBlocked(d.code)){etfBlockModal([d.code]);return;}
  if(i!=null)PD().dividends[i]=d;else PD().dividends.push(d);
  if(d.qty&&d.assetId)assetSyncQtyCheckpoint(d.assetId,d.date,num(d.qty));
  DIV_EXPANDED.add(d.code);
  save();closeModal();render();toast('Dividend saved');
}

/* ================= STATEMENT IMPORT (dividends) =================
   Supports both CSV and Stake's .xlsx "Investment Income" export.
   Generic CSV parser (handles quoted fields with embedded commas/newlines)
   plus flexible header-alias matching, since different brokers (and Stake's
   own report versions) use slightly different column names. The preview
   table that follows lets the user fix any mis-detected values before
   importing, so exact header matching isn't critical. */
function parseCSV(text){
  const rows=[];let row=[],field='',inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(inQuotes){
      if(c==='"'&&n==='"'){field+='"';i++;}
      else if(c==='"')inQuotes=false;
      else field+=c;
    }else{
      if(c==='"')inQuotes=true;
      else if(c===','){row.push(field);field='';}
      else if(c==='\r'){/* skip — \n handles line breaks */}
      else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
      else field+=c;
    }
  }
  if(field!==''||row.length){row.push(field);rows.push(row);}
  return rows.filter(r=>r.some(c=>c.trim()!==''));
}
const DIV_CSV_ALIASES={
  date:['payment date','date paid','paid date','ex date','ex-date','transaction date','date'],
  code:['security description','asx code','security code','instrument code','symbol','ticker','code'],
  name:['company name','security name','instrument name','description','company','security','name'],
  qty:['participating shares','units held','quantity held','number of units','units','shares','quantity'],
  franked:['franked amount','franked dividend','franked'],
  unfranked:['unfranked amount','unfranked dividend','unfranked'],
  frankingCredit:['franking credit','imputation credit','franking credits','imputation credits','tax offset','tax credit'],
  gross:['gross dividend','gross amount','total dividend','dividend amount','total amount','total payment','gross'],
  net:['net dividend','net amount','net payment','amount paid','total received'],
  type:['distribution type','dividend type','type'],
};
function csvDetectCol(headers,aliases){
  const lower=headers.map(h=>h.trim().toLowerCase());
  for(const alias of aliases){const idx=lower.indexOf(alias);if(idx>=0)return idx;}
  for(let i=0;i<lower.length;i++){if(aliases.some(a=>lower[i].includes(a)))return i;}
  return -1;
}
/* Normalises common AU date formats (DD/MM/YYYY, D/M/YY, YYYY-MM-DD,
   "1 Jul 2025") to ISO yyyy-mm-dd. Returns '' if unrecognised. */
function csvNormDate(s){
  s=String(s||'').trim();
  if(!s)return'';
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){let yr=m[3];if(yr.length===2)yr='20'+yr;return`${yr}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  m=s.match(/^(\d{1,2})\s+([a-zA-Z]{3,})\s+(\d{4})$/);
  if(m){const mo=months[m[2].slice(0,3).toLowerCase()];if(mo)return`${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
  return'';
}
let DIV_IMPORT_ROWS=null; // null = import panel closed
let DIV_IMPORT_PLATFORM=null; // detected platform (Stake/Superhero)
let DIV_IMPORT_FILE=null; // the raw file being imported, kept so it can be attached as a receipt to the resulting dividends
function divImportOpen(){DIV_IMPORT_ROWS=[];DIV_IMPORT_FILE=null;render();}
function divImportCancel(){DIV_IMPORT_ROWS=null;DIV_IMPORT_FILE=null;render();}
/* Maps raw header+data rows (array of arrays, row[0]=headers) into the
   preview row shape used by DIV_IMPORT_ROWS. Shared by both the CSV and
   XLSX paths. */
function csvRowsToImportRows(rows){
  if(rows.length<2)return[];
  const headers=rows[0];
  const col={
    date:csvDetectCol(headers,DIV_CSV_ALIASES.date),
    code:csvDetectCol(headers,DIV_CSV_ALIASES.code),
    name:csvDetectCol(headers,DIV_CSV_ALIASES.name),
    qty:csvDetectCol(headers,DIV_CSV_ALIASES.qty),
    franked:csvDetectCol(headers,DIV_CSV_ALIASES.franked),
    unfranked:csvDetectCol(headers,DIV_CSV_ALIASES.unfranked),
    frankingCredit:csvDetectCol(headers,DIV_CSV_ALIASES.frankingCredit),
    gross:csvDetectCol(headers,DIV_CSV_ALIASES.gross),
    net:csvDetectCol(headers,DIV_CSV_ALIASES.net),
    type:csvDetectCol(headers,DIV_CSV_ALIASES.type),
  };
  return rows.slice(1).map(r=>{
    let code=col.code>=0?String(r[col.code]||'').trim():'';
    let name=col.name>=0?String(r[col.name]||'').trim():'';
    // Stake's "Symbol" column combines code + name, e.g.
    // "NAB - National Australia Bank Limited" or
    // "HVST - BETADIVHAR ETF UNITS [HVST]" — split it, and strip a
    // trailing "[CODE]" suffix that just repeats the code.
    const dashIdx=code.indexOf(' - ');
    if(dashIdx>=0){
      const after=code.slice(dashIdx+3).trim();
      code=code.slice(0,dashIdx).trim();
      if(!name)name=after.replace(new RegExp(`\\s*\\[${code}\\]\\s*$`,'i'),'').trim();
    }
    code=code.toUpperCase();
    const franked=col.franked>=0?num(r[col.franked]):0;
    // Raw cell value before any numeric coercion — needed to tell a
    // genuinely blank/missing cell apart from an explicit "0", since both
    // come out as 0 once num() runs on them.
    const rawUnfrankedCell=col.unfranked>=0?r[col.unfranked]:undefined;
    const unfrankedCellBlank=col.unfranked<0||rawUnfrankedCell===undefined||rawUnfrankedCell===null||String(rawUnfrankedCell).trim()==='';
    let unfranked=unfrankedCellBlank?0:num(rawUnfrankedCell);
    // IMPORTANT: use the file's own stated total amount directly — never
    // recalculate it from franked+unfranked, since statements sometimes
    // round each component independently and the sum can be a cent or two
    // off from what the statement itself says you were actually paid.
    let payment=null;
    if(col.net>=0)payment=num(r[col.net]);
    else if(col.gross>=0)payment=num(r[col.gross]);
    if(payment==null||!payment)payment=franked+unfranked; // fallback only if no total column exists
    // Resolve a missing/unreliable unfranked figure from the two numbers we
    // do trust — the statement's own total payment, and the franked amount.
    // Two cases trigger this:
    //  1. The unfranked cell was genuinely blank/missing in the source file.
    //  2. The cell had an explicit value but it doesn't reconcile with
    //     payment (e.g. a "0" placeholder from a source that failed to
    //     calculate the real split — seen in practice with some third-party
    //     "estimated" dividend trackers). Franked + the statement's own
    //     total are trusted over a non-reconciling unfranked figure.
    // Either way the result is flagged via `unfrankedInferred` so the
    // import preview can show it was calculated, not read verbatim.
    let unfrankedInferred=false;
    if(payment>0){
      const reconciles=Math.abs((unfranked+franked)-payment)<=0.02;
      if(unfrankedCellBlank||!reconciles){
        const inferred=Math.max(0,Math.round((payment-franked)*100)/100);
        if(Math.abs(inferred-unfranked)>0.02){unfranked=inferred;unfrankedInferred=true;}
      }
    }
    return{
      checked:true,
      date:col.date>=0?csvNormDate(r[col.date]):'',
      code,name,
      type:col.type>=0?String(r[col.type]||'').trim():'',
      qty:col.qty>=0?num(r[col.qty]):'',
      unfranked,franked,unfrankedInferred,
      frankingCredit:col.frankingCredit>=0?num(r[col.frankingCredit]):0,
      payment,
    };
  }).filter(r=>r.code||r.payment);
}
/* Lazy-load SheetJS (only needed if the user picks an .xlsx/.xls file) */
async function loadXLSXLib(){
  if(window.XLSX)return;
  await new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=res;
    s.onerror=()=>rej(new Error('Could not load the spreadsheet reader — check your internet connection'));
    document.head.appendChild(s);
  });
}
/* Auto-unchecks any row whose code matches an existing ETF/Managed Fund
   asset, right after a statement is parsed — so the user doesn't have to
   manually find and deselect them before importing. They can still
   re-check a row themselves if they really want to (the hard block at
   confirm-time still applies either way). */
function divImportAutoDeselectETFs(out){
  const blocked=new Set();
  out.forEach(r=>{
    if(r.code&&etfCodeBlocked(r.code)){r.checked=false;blocked.add(r.code.trim().toUpperCase());}
  });
  if(blocked.size)toast(`Deselected ${[...blocked].join(', ')} — already tracked as ETF/Managed Fund${blocked.size>1?'s':''}`);
}
function divImportFile(input){
  const file=input.files[0];if(!file)return;
  DIV_IMPORT_FILE=file;
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext==='xlsx'||ext==='xls'){
    const reader=new FileReader();
    reader.onload=async()=>{
      try{
        await loadXLSXLib();
        const wb=XLSX.read(reader.result,{type:'array'});
        let out=[];
        // Stake's "Aus Dividends (Estimated)" sheet (or similarly-named /
        // any sheet whose headers look like AU dividend data).
        let auName=wb.SheetNames.find(n=>/aus.*divid|australian.*divid/i.test(n));
        if(!auName){
          auName=wb.SheetNames.find(n=>{
            if(/disclaim|summary|glossary/i.test(n))return false;
            const r=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false});
            return r[0]&&r[0].some(h=>/franking credit/i.test(String(h)));
          });
        }
        if(auName)out=out.concat(csvRowsToImportRows(XLSX.utils.sheet_to_json(wb.Sheets[auName],{header:1,raw:false})));
        if(!out.length){toast("Could not find dividend rows in that file — check it's a Stake Investment Income report");DIV_IMPORT_ROWS=[];}
        else{
          divImportAutoDeselectETFs(out);
          DIV_IMPORT_ROWS=out;if(!DIV_IMPORT_PLATFORM)DIV_IMPORT_PLATFORM='Stake';
        }
        render();
      }catch(e){toast('Could not read file: '+e.message);}
    };
    reader.onerror=()=>toast('Could not read file');
    reader.readAsArrayBuffer(file);
    return;
  }
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      let text=String(reader.result);
      // Superhero's Income Report CSV has metadata rows at the top before
      // the actual column headers (Entity Name, Account Name, etc.), plus
      // a mysterious "0" row. Strip everything before the first real
      // header row that looks like "Security Description" or similar.
      const lines=text.split(/\r?\n/);
      const headerIdx=lines.findIndex(l=>/security description|payment date|franked amount/i.test(l));
      if(headerIdx>0)text=lines.slice(headerIdx).join('\n');
      const rows=parseCSV(text).filter(r=>r.length>1&&!r[0].match(/^"?TOTAL"?$/i));
      const out=csvRowsToImportRows(rows);
      if(!out.length){toast('Could not find any dividend rows — check the file format');DIV_IMPORT_ROWS=[];DIV_IMPORT_PLATFORM=null;}
      else{
        divImportAutoDeselectETFs(out);
        DIV_IMPORT_ROWS=out;
        // Detect platform from file name or content
        const fname=file.name.toLowerCase();
        DIV_IMPORT_PLATFORM=fname.includes('superhero')||text.includes('Superhero')||text.includes('Account Number')?'Superhero':'Stake';
      }
      render();
    }catch(e){toast('Could not read file: '+e.message);}
  };
  reader.readAsText(file);
}
function divImportCellChange(i,field,value){
  if(!DIV_IMPORT_ROWS||!DIV_IMPORT_ROWS[i])return;
  const r=DIV_IMPORT_ROWS[i];
  if(field==='checked')r.checked=value;
  else if(field==='date'||field==='code'||field==='name')r[field]=value;
  else{
    r[field]=num(value);
    // A manual edit to the unfranked figure means it's no longer a
    // calculated estimate — it's the user's own corrected value.
    if(field==='unfranked')r.unfrankedInferred=false;
  }
  render();
}
function divImportToggleAll(checked){
  if(!DIV_IMPORT_ROWS)return;
  DIV_IMPORT_ROWS.forEach(r=>r.checked=checked);
  render();
}
function divImportToggleCode(code,checked){
  if(!DIV_IMPORT_ROWS)return;
  DIV_IMPORT_ROWS.filter(r=>r.code===code).forEach(r=>r.checked=checked);
  render();
}
async function divImportConfirm(){
  if(!DIV_IMPORT_ROWS)return;
  const rows=DIV_IMPORT_ROWS.filter(r=>r.checked);
  if(!rows.length){toast('No rows selected');return;}
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const shareAssets=assetsForPerson([pid]).filter(a=>a.kind==='shares');
  const platform=DIV_IMPORT_PLATFORM||'Stake';

  // Check if any checked code matches an ETF/managed fund asset (any platform)
  const etfRows=rows.filter(r=>etfCodeBlocked(r.code));
  if(etfRows.length){
    const codeList=[...new Set(etfRows.map(r=>r.code.trim().toUpperCase()))].join(', ');
    modal('ETF / Managed fund detected',`
      <div class="note" style="border-color:var(--gold)">
        <b>Import blocked for ${codeList}.</b>
      </div>
      <div class="mt">The following selected securities exist in your <b>ETF / Managed Funds</b> section, not as individual shares:
        <ul style="margin:8px 0 0 18px">${[...new Set(etfRows.map(r=>r.code.trim().toUpperCase()))].map(c=>`<li><b>${esc(c)}</b></li>`).join('')}</ul>
      </div>
      <div class="mt">Managed funds distribute income via <b>AMIT statements</b> which include tax labels (13U, 13C, 18A, etc.) that aren't in a dividend CSV. Importing them here would give you incorrect tax figures.
      </div>
      <div class="mt">To fix this:
        <ol style="margin:6px 0 0 18px;line-height:1.7">
          <li>Deselect ${codeList} in the import preview</li>
          <li>Import the remaining ordinary shares as normal</li>
          <li>For ${codeList}, go to <a href="#" onclick="closeModal();go('funds');return false">ETF / Managed Funds</a> and use <b>Import AMIT statement</b> with your broker's annual PDF</li>
        </ol>
      </div>`,
      `<button class="btn" data-close>OK — go back and deselect them</button>`);
    return;
  }

  if(!DB.platforms.includes(platform))DB.platforms.push(platform);
  let created=0,imported=0;
  const B=PD();
  const receiptId=DIV_IMPORT_FILE?uid():null;
  const receiptName=DIV_IMPORT_FILE?DIV_IMPORT_FILE.name:null;
  rows.forEach(r=>{
    if(!r.code||!r.date)return;
    let asset=shareAssets.find(a=>(a.code||'').toUpperCase()===r.code&&(a.platform||'')===platform);
    if(!asset){
      asset={id:uid(),pid,name:r.name||r.code,kind:'shares',code:r.code,platform,costs:[],transactions:[]};
      DB.assets.push(asset);shareAssets.push(asset);created++;
    }
    const rec={id:uid(),code:r.code,platform:asset.platform||platform,date:r.date,
      payment:r.payment,unfranked:r.unfranked,franked:r.franked,frankingCredit:r.frankingCredit,
      qty:r.qty||'',assetId:asset.id};
    if(receiptId){rec.receiptId=receiptId;rec.receiptName=receiptName;}
    B.dividends.push(rec);
    DIV_EXPANDED.add(rec.code);
    if(rec.qty)assetSyncQtyCheckpoint(asset.id,rec.date,num(rec.qty));
    imported++;
  });
  const fileToUpload=DIV_IMPORT_FILE;
  DIV_IMPORT_ROWS=null;DIV_IMPORT_FILE=null;
  save();render();
  toast(`Imported ${imported} dividend${imported===1?'':'s'}${created?` · created ${created} new asset${created===1?'':'s'}`:''}`);
  if(fileToUpload&&receiptId){
    try{
      await rcptPut({id:receiptId,name:fileToUpload.name,type:fileToUpload.type,blob:fileToUpload},{fy:fyDisplay(FY()),category:'Dividends',date:rows[0]?.date||todayISO(),itemName:'Dividend statement',pid});
      toast('Statement attached to the imported dividends');
    }catch(e){toast("Couldn't attach the statement — you can attach it later from each row");}
  }
}
function divImportPanel(){
  if(DIV_IMPORT_ROWS===null)return'';
  if(!DIV_IMPORT_ROWS.length){
    return `<div class="card"><div class="chead"><h2>Import dividends</h2><button class="btn ghost small" onclick="divImportCancel()">✕ Close</button></div>
      <div class="cbody">
        <div class="kv"><span class="k">Stake (.xlsx) or Superhero Income Report (.csv)</span>
          <input type="file" class="input" accept=".csv,text/csv,.xlsx,.xls" style="max-width:280px" onchange="divImportFile(this)"></div>
        <div class="hint mt">Supported formats: Stake's "Investment Income" export (.xlsx from Account → Reports) and Superhero's "Income Report" (.csv from Activity → Reports → Income). You'll get a preview to review before anything is saved. The file itself is kept and attached as the supporting statement on every dividend it produces.</div>
      </div></div>`;
  }
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const shareAssets=assetsForPerson([pid]).filter(a=>a.kind==='shares');
  const checkedCount=DIV_IMPORT_ROWS.filter(r=>r.checked).length;
  const platform=DIV_IMPORT_PLATFORM||'Stake';

  // Group rows by security code
  const codeOrder=[],codeMap={};
  DIV_IMPORT_ROWS.forEach((r,i)=>{
    const code=r.code||'(no code)';
    if(!codeMap[code]){codeMap[code]=[];codeOrder.push(code);}
    codeMap[code].push({r,i});
  });

  let groupedRows='';
  codeOrder.forEach(code=>{
    const items=codeMap[code];
    const allChecked=items.every(({r})=>r.checked);
    const someChecked=items.some(({r})=>r.checked);
    const isEtf=code!=='(no code)'&&etfCodeBlocked(code);
    const exists=code!=='(no code)'&&shareAssets.some(a=>(a.code||'').toUpperCase()===code&&(a.platform||'')===platform);
    const groupMismatchCount=items.filter(({r})=>Math.abs((num(r.unfranked)+num(r.franked))-num(r.payment))>0.02).length;
    const groupInferredCount=items.filter(({r})=>r.unfrankedInferred).length;
    const statusBadge=(code==='(no code)'?''
      :isEtf?`<span class="badge gold" style="font-size:.65rem" title="This code already exists as an ETF/Managed Fund asset — importing it as a dividend will be blocked">⚠ existing ETF — will be blocked</span>`
      :exists?`<span class="badge euc" style="font-size:.65rem">existing asset</span>`
      :`<span class="badge gold" style="font-size:.65rem">will create</span>`)
      +(groupMismatchCount?` <span class="badge red" style="font-size:.65rem">⚠ ${groupMismatchCount} payment${groupMismatchCount>1?'s':''} need review</span>`:'')
      +(groupInferredCount?` <span class="badge blue" style="font-size:.65rem" title="Unfranked was missing or didn't reconcile with the total payment, so it was calculated as Total − Franked">🧮 ${groupInferredCount} unfranked figure${groupInferredCount>1?'s':''} calculated</span>`:'');
    groupedRows+=`<tr class="subhead" style="${isEtf?'background:color-mix(in srgb,var(--gold) 10%,transparent)':''}"><td style="padding:8px 8px 6px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
        <input type="checkbox" class="div-group-cb" data-code="${esc(code)}" ${allChecked?'checked':''} ${(!allChecked&&someChecked)?'data-indeterminate="1"':''} onchange="divImportToggleCode('${esc(code)}',this.checked)" style="width:16px;height:16px">
        <b style="font-size:.9rem">${esc(code)}</b>
      </label></td>
      <td colspan="7" style="padding:8px 8px 6px"><span class="muted" style="font-size:.82rem">${items.length} payment${items.length>1?'s':''} · total ${fmt$(items.reduce((s,{r})=>s+num(r.payment),0))}</span> ${statusBadge}</td>
      <td></td></tr>`;
    items.forEach(({r,i})=>{
      // Sanity check: unfranked + franked should equal the statement's own
      // total payment figure. csvRowsToImportRows already tries to resolve
      // this automatically (unfrankedInferred) when unfranked was blank or
      // didn't reconcile — by construction, an inferred row WILL reconcile,
      // so this mismatch check should only ever fire on rows where
      // inference wasn't possible (e.g. franked > payment) or where the
      // user has since hand-edited a value back out of reconciliation.
      const splitTotal=num(r.unfranked)+num(r.franked);
      const mismatch=Math.abs(splitTotal-num(r.payment))>0.02;
      const inferred=r.unfrankedInferred&&!mismatch;
      groupedRows+=`<tr style="${mismatch?'background:color-mix(in srgb,var(--red) 6%,transparent)':inferred?'background:color-mix(in srgb,var(--euc) 5%,transparent)':''}">
        <td style="padding-left:24px"><input type="checkbox" ${r.checked?'checked':''} onchange="divImportCellChange(${i},'checked',this.checked)"></td>
        <td><input class="input" style="width:108px" type="date" value="${esc(r.date)}" onchange="divImportCellChange(${i},'date',this.value)"></td>
        <td><input class="input" style="width:70px;text-transform:uppercase" value="${esc(r.code)}" onchange="divImportCellChange(${i},'code',this.value)"></td>
        <td style="font-size:.8rem">${esc(r.name)}${r.type?` <span class="muted">· ${esc(r.type)}</span>`:''}</td>
        <td><input class="input money" style="width:64px" value="${r.qty}" onchange="divImportCellChange(${i},'qty',this.value)"></td>
        <td><div style="position:relative"><input class="input money" style="width:84px;${mismatch?'border-color:var(--red)':inferred?'border-color:var(--euc)':''}" value="${r.unfranked}" onchange="divImportCellChange(${i},'unfranked',this.value)" title="${inferred?'Calculated as Total − Franked — the source value was missing or didn\'t reconcile':''}">${inferred?'<span style="position:absolute;top:-6px;right:-4px;font-size:.7rem" title="Calculated, not from the source file">🧮</span>':''}</div></td>
        <td><input class="input money" style="width:84px;${mismatch?'border-color:var(--red)':''}" value="${r.franked}" onchange="divImportCellChange(${i},'franked',this.value)"></td>
        <td><input class="input money" style="width:84px" value="${r.frankingCredit}" onchange="divImportCellChange(${i},'frankingCredit',this.value)"></td>
        <td><input class="input money" style="width:84px" value="${r.payment}" onchange="divImportCellChange(${i},'payment',this.value)"></td>
      </tr>
      ${mismatch?`<tr style="background:color-mix(in srgb,var(--red) 6%,transparent)"><td></td><td colspan="8" style="padding:0 8px 8px;font-size:.78rem;color:var(--red)">⚠ Unfranked + Franked (${fmt$(splitTotal)}) doesn't add up to the total payment (${fmt$(num(r.payment))}) — the source file's franking split looks wrong for this payment. Check it against the real distribution statement before importing.</td></tr>`:''}
      ${inferred?`<tr style="background:color-mix(in srgb,var(--euc) 5%,transparent)"><td></td><td colspan="8" style="padding:0 8px 8px;font-size:.78rem;color:var(--euc)">🧮 Unfranked was missing or didn't reconcile in the source file, so it was calculated as Total − Franked (${fmt$(num(r.payment))} − ${fmt$(num(r.franked))} = ${fmt$(num(r.unfranked))}) — double-check against the real distribution statement.</td></tr>`:''}`;
    });
  });

  return `<div class="card"><div class="chead"><h2>Import dividends</h2>
      <span class="actions">
        <button class="btn ghost small" onclick="divImportToggleAll(true)">Select all</button>
        <button class="btn ghost small" onclick="divImportToggleAll(false)">Deselect all</button>
        <button class="btn ghost small" onclick="divImportCancel()">✕ Cancel</button>
        <button class="btn primary small" onclick="divImportConfirm()">Import ${checkedCount} selected</button>
      </span></div>
    <div class="cbody tight">
    <div class="kv" style="padding:8px 12px"><span class="k">Platform these holdings are on</span>
      <select class="input" style="width:auto;display:inline-block" onchange="DIV_IMPORT_PLATFORM=this.value;render()">
        ${DB.platforms.map(p=>`<option value="${esc(p)}" ${platform===p?'selected':''}>${esc(p)}</option>`).join('')}
      </select></div>
    <div class="hint" style="padding:0 12px 8px">Grouped by security — use the checkboxes to select or deselect individual securities. Rows for an ASX code you don't already hold will create that asset automatically.</div>
    ${(()=>{
      const blockedCodes=[...new Set(DIV_IMPORT_ROWS.filter(r=>etfCodeBlocked(r.code)).map(r=>r.code.trim().toUpperCase()))];
      const blockedChecked=[...new Set(DIV_IMPORT_ROWS.filter(r=>r.checked&&etfCodeBlocked(r.code)).map(r=>r.code.trim().toUpperCase()))];
      if(!blockedCodes.length)return'';
      return blockedChecked.length
        ?`<div class="note" style="margin:0 12px 10px;border-color:var(--gold);background:color-mix(in srgb,var(--gold) 8%,transparent)">⚠ <b>${blockedChecked.join(', ')}</b> ${blockedChecked.length>1?'are':'is'} re-selected but already ${blockedChecked.length>1?'exist':'exists'} as ETF/Managed Fund asset${blockedChecked.length>1?'s':''} — the import will be blocked when you click Import unless deselected.</div>`
        :`<div class="note" style="margin:0 12px 10px;border-color:var(--gold);background:color-mix(in srgb,var(--gold) 8%,transparent)">ℹ️ <b>${blockedCodes.join(', ')}</b> ${blockedCodes.length>1?'were':'was'} automatically deselected — already tracked as ETF/Managed Fund asset${blockedCodes.length>1?'s':''}. Update ${blockedCodes.length>1?'their':'its'} distribution via <a href="#" onclick="go('funds');return false">ETF / Managed Funds</a> instead.</div>`;
    })()}
    ${(()=>{
      const mismatchCodes=[...new Set(DIV_IMPORT_ROWS.filter(r=>Math.abs((num(r.unfranked)+num(r.franked))-num(r.payment))>0.02).map(r=>r.code.trim().toUpperCase()))];
      if(!mismatchCodes.length)return'';
      return `<div class="note" style="margin:0 12px 10px;border-color:var(--red);background:color-mix(in srgb,var(--red) 6%,transparent)">⚠ <b>${mismatchCodes.join(', ')}</b> ${mismatchCodes.length>1?'have':'has'} payments where Unfranked + Franked doesn't add up to the total payment shown — the source file's franking split looks unreliable for ${mismatchCodes.length>1?'these':'this'} payment${mismatchCodes.length>1?'s':''}. Flagged rows are highlighted in red below — check the real distribution statement and correct the figures before importing.</div>`;
    })()}
    ${(()=>{
      const inferredRows=DIV_IMPORT_ROWS.filter(r=>r.unfrankedInferred);
      if(!inferredRows.length)return'';
      const inferredCodes=[...new Set(inferredRows.map(r=>r.code.trim().toUpperCase()))];
      return `<div class="note" style="margin:0 12px 10px;border-color:var(--euc);background:color-mix(in srgb,var(--euc) 5%,transparent)">🧮 <b>${inferredRows.length}</b> payment${inferredRows.length>1?'s':''} (${inferredCodes.join(', ')}) had an unfranked figure that was missing or didn't reconcile with the total payment — calculated as Total − Franked instead. Marked rows are highlighted below; double-check against the real distribution statement.</div>`;
    })()}
    <table class="tbl"><thead><tr>
      <th></th><th>Date</th><th>Code</th><th>Company</th><th class="num">Qty</th><th class="num">Unfranked</th><th class="num">Franked</th><th class="num">Franking credit</th><th class="num">Total payment</th>
    </tr></thead><tbody>${groupedRows}</tbody></table></div>
    <div class="note">Review and edit any values before importing — column detection is a best guess. Everything imports into the currently-selected financial year (<b>${esc(fyDisplay(FY()))}</b>) — switch FY first if this report covers a different year.</div>
    </div>`;
}
/* ATO trust-distribution labels, verified against a real Superhero AMIT
   statement. Each entry is [code, description, category]:
   - 'income'    → included in assessable income
   - 'offset'    → included in tax offsets (like franking credits — reduces
                    tax payable dollar-for-dollar, NOT taxable income)
   - 'deduction' → included in deductions (reduces taxable income)
   - 'memo'      → informational only, stored for record-keeping but not
                    summed anywhere (18H and 20M are pre-discount/component
                    figures already reflected in 18A and 20E respectively —
                    summing them too would double-count). */
const MFD_LABELS=[
  ['13L','Label L — Share of net income from trusts, less net capital gains, foreign income and franked distributions (primary production income)','income'],
  ['13U','Label U — Share of net income from trusts, less net capital gains, foreign income and franked distributions (non-primary production income)','income'],
  ['13C','Label C — Franked distribution from trusts','income'],
  ['13Y','Label Y — Other deductions relating to non-primary production income','deduction'],
  ['13Q','Label Q — Share of franking credits from franked dividends','offset'],
  ['18A','Label 18A — Net capital gain','income'],
  ['18H','Label 18H — Total current year capital gains (memo only — already reflected in 18A)','memo'],
  ['20E','Label 20E — Assessable foreign source income','income'],
  ['20M','Label 20M — Other net foreign source income (memo — component of 20E)','memo'],
  ['20F','Label 20F — Australian franking credits from a New Zealand franking company','income'],
  ['20O','Label 20O — Foreign income tax offset','offset'],
];
const MFD_INCOME_LABELS=MFD_LABELS.filter(l=>l[2]==='income').map(l=>l[0]);
const MFD_OFFSET_LABELS=MFD_LABELS.filter(l=>l[2]==='offset').map(l=>l[0]);
const MFD_DEDUCTION_LABELS=MFD_LABELS.filter(l=>l[2]==='deduction').map(l=>l[0]);
/* Sums a person's fund labels into assessable income / tax offsets /
   deductions per the categorisation above. Shared by the Managed Funds
   page and the FY summary so the two never drift apart. */
function fundLabelTotals(b){
  const L=k=>b.funds.reduce((s,f)=>s+num(f.labels?.[k]),0);
  return{
    assess:MFD_INCOME_LABELS.reduce((s,k)=>s+L(k),0),
    offsets:MFD_OFFSET_LABELS.reduce((s,k)=>s+L(k),0),
    ded:MFD_DEDUCTION_LABELS.reduce((s,k)=>s+L(k),0),
    L,
  };
}
const ASX_STATIC=[['VAS','Vanguard Australian Shares Index ETF'],['VGS','Vanguard MSCI Index Intl Shares ETF'],['VHY','Vanguard Aust Shares High Yield ETF'],['IVV','iShares S&P 500 ETF AUD'],['NDQ','BetaShares NASDAQ 100 ETF'],['A200','BetaShares Australia 200 ETF'],['STW','SS SPDR S&P/ASX 200 ETF'],['SLF','SS SPDR ASX 200 Listed Property ETF'],['OZR','SS SPDR ASX 200 Resources ETF'],['HVST','Betashares Au Div Harvester Active ETF'],['YMAX','Betashares Aus Top20 Eq Yield Max ETF'],['DHHF','BetaShares Diversified All Growth ETF'],['VDHG','Vanguard Diversified High Growth ETF'],['ANZ','ANZ Group Holdings'],['NAB','National Australia Bank'],['CBA','Commonwealth Bank'],['WBC','Westpac Banking Corp'],['BOQ','Bank of Queensland'],['BHP','BHP Group'],['FMG','Fortescue Ltd'],['TLS','Telstra Group'],['CLW','Charter Hall Long WALE REIT'],['IPH','IPH Ltd'],['WES','Wesfarmers'],['WOW','Woolworths Group'],['CSL','CSL Ltd'],['MQG','Macquarie Group'],['QAN','Qantas Airways'],['RIO','Rio Tinto'],['WDS','Woodside Energy']];
/* ================= AMIT STATEMENT IMPORT (PDF) =================
   Each fund in an AMIT member annual statement is its own section headed
   "ATTRIBUTION MANAGED INVESTMENT TRUST MEMBER ANNUAL STATEMENT", with a
   "SUMMARY OF TAX RETURN (SUPPLEMENTARY SECTION)" table of ATO label codes
   ($ amounts) and an "ASX Code: XXX" line in the letterhead above it. PDF.js
   gives text as positioned items, not lines, so we first reconstruct rows
   by grouping items with similar baselines (Y) and sorting by X — then run
   simple "<code> ... $<amount>" regexes per known label over each section,
   picking whichever candidate amount sits closest to the code (see
   amitNearestAmount) since reconstructed line order doesn't always match
   visual row order. As with the dividend import, the result is an editable
   preview — exact extraction isn't critical since the user reviews every
   value. */
let AMIT_IMPORT_ROWS=null; // null = panel closed
let AMIT_IMPORT_FILE=null; // the raw PDF being imported, kept so it can be attached as a receipt to the resulting funds
let AMIT_IMPORT_PLATFORM='Superhero'; // platform selection for AMIT import
let AMIT_DEBUG_OPEN=null; // index of row currently showing raw extracted text, for troubleshooting
function amitToggleDebug(i){AMIT_DEBUG_OPEN=AMIT_DEBUG_OPEN===i?null:i;render();}
function amitImportOpen(){AMIT_IMPORT_ROWS=[];AMIT_IMPORT_FILE=null;AMIT_DEBUG_OPEN=null;AMIT_IMPORT_PLATFORM=(DB.platforms||[])[0]||'Superhero';render();}
function amitImportCancel(){AMIT_IMPORT_ROWS=null;AMIT_IMPORT_FILE=null;AMIT_DEBUG_OPEN=null;render();}
async function loadPDFJSLib(){
  if(window.pdfjsLib)return;
  await new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    s.onload=res;
    s.onerror=()=>rej(new Error('Could not load the PDF reader — check your internet connection'));
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}
async function amitExtractText(arrayBuffer){
  const pdf=await pdfjsLib.getDocument({data:arrayBuffer}).promise;
  let text='';
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const content=await page.getTextContent();
    const lines={};
    content.items.forEach(it=>{
      const y=Math.round(it.transform[5]/2)*2; // group baselines within ~2pt
      (lines[y]=lines[y]||[]).push(it);
    });
    Object.keys(lines).map(Number).sort((a,b)=>b-a).forEach(y=>{
      const row=lines[y].sort((a,b)=>a.transform[4]-b.transform[4]);
      // Join items using gap-aware spacing rather than always inserting a
      // literal space. Some statement generators (confirmed on a real
      // Superhero AMIT statement) emit one text-showing operator per
      // CHARACTER rather than per word — blindly joining every item with
      // " " then garbles "13L" into "1 3 L" and "$0.00" into "$ 0 . 0 0",
      // breaking every downstream label/amount match. Only insert a space
      // when the horizontal gap between consecutive items is wide enough
      // to be a genuine word break, not normal letter-to-letter advance.
      let line='',prevEnd=null;
      row.forEach(it=>{
        const start=it.transform[4];
        const fontSize=Math.abs(it.transform[3])||10;
        if(prevEnd!=null&&(start-prevEnd)>fontSize*0.22)line+=' ';
        line+=it.str;
        prevEnd=start+(it.width||0);
      });
      text+=line.replace(/\s+/g,' ').trim()+'\n';
    });
  }
  return text;
}
// Header text itself sometimes wraps onto two reconstructed lines (seen on
// a real SPDR/State Street statement, where "...Annual" and "Statement..."
// land in different Y-buckets) — match on \s+ between words, not a literal
// space, so a line break in the middle of the header still matches.
const AMIT_HEADER='ATTRIBUTION MANAGED INVESTMENT TRUST MEMBER ANNUAL STATEMENT';
const AMIT_HEADER_RE_SRC=AMIT_HEADER.split(' ').join('\\s+');
// Find the $ amount nearest a given ATO label code within a section, trying
// both "code then amount" and "amount then code" since layouts vary, and —
// critically — picking whichever candidate is CLOSEST rather than whichever
// pattern is tried first. Real statements (confirmed on a Betashares/Link
// Market Services statement) interleave reconstructed lines so that a code
// is sometimes immediately followed by the NEXT row's amount before its own
// row's amount appears; always trusting "code ... amount" in that case grabs
// the wrong row's figure, so we score every candidate by distance and keep
// the smallest.
function amitNearestAmount(section,code){
  const codeM=new RegExp('\\b'+code+'\\b').exec(section);
  if(!codeM)return null;
  const codeStart=codeM.index,codeEnd=codeStart+codeM[0].length;
  const WINDOW=120;
  const winStart=Math.max(0,codeStart-WINDOW);
  const winEnd=Math.min(section.length,codeEnd+WINDOW);
  const windowText=section.slice(winStart,winEnd);
  const relStart=codeStart-winStart,relEnd=relStart+(codeEnd-codeStart);
  // Amount can appear with or without a literal "$", with commas, and
  // negatives can be shown as "-123.45" or "(123.45)".
  const amtRe=/\$?\s*(\(?-?[\d,]+\.\d{2}\)?)/g;
  let am,best=null,bestDist=Infinity;
  while((am=amtRe.exec(windowText))){
    const aStart=am.index,aEnd=aStart+am[0].length;
    let dist;
    if(aEnd<=relStart)dist=relStart-aEnd;
    else if(aStart>=relEnd)dist=aStart-relEnd;
    else continue; // overlaps the code itself — not a real amount
    if(dist<bestDist){bestDist=dist;best=am[1];}
  }
  return best;
}
function amitParseSections(text){
  const out=[];
  const headerRe=new RegExp(AMIT_HEADER_RE_SRC,'gi');
  const starts=[];let m;
  while((m=headerRe.exec(text)))starts.push(m.index);
  starts.forEach((idx,i)=>{
    const sectionEnd=i+1<starts.length?starts[i+1]:text.length;
    const section=text.slice(idx,sectionEnd);
    // Look back as far as the previous fund's header (so multi-fund PDFs
    // don't bleed into each other), or ~3000 chars for the first fund.
    const beforeStart=i>0?starts[i-1]:Math.max(0,idx-3000);
    const before=text.slice(beforeStart,idx);
    let code='',name='';
    // Most registry-administered statements (Link Market Services / MUFG,
    // used by State Street/SPDR, Betashares and many others) print an
    // explicit "ASX Code: XXX" line in the letterhead — far more reliable
    // than guessing from whatever line happens to sit just above the
    // header, which on real statements is often a date or address line,
    // not the fund name. Take the last match before the header, in case
    // an earlier fund's letterhead is also in range.
    const asxMatches=[...before.matchAll(/ASX\s*code\s*:?\s*([A-Z]{1,6})\b/gi)];
    if(asxMatches.length)code=asxMatches[asxMatches.length-1][1].toUpperCase();
    const lines=before.trim().split('\n').map(l=>l.trim()).filter(Boolean);
    if(!code){
      // Fallback: fund name + code from the line(s) just above the header,
      // e.g. "STATE STREET GLOBAL ADVISORS S&P/ASX 200 FUND - STW".
      for(let j=lines.length-1;j>=0;j--){
        const mm=lines[j].match(/^(.*?)[\s\-–]+([A-Z]{2,6})$/);
        if(mm){name=mm[1].trim();code=mm[2];break;}
      }
    }
    const known=ASX_STATIC.find(a=>a[0]===code);
    if(known)name=known[1];
    if(!name){
      // Best-effort fund name for codes we don't recognise: the longest
      // line mentioning "fund" that isn't a contact-detail line. Statement
      // layouts sometimes glue a contact label onto the same line via a
      // Y-coordinate collision (e.g. "...Fund Telephone: 1300 ...") — cut
      // that off if present.
      const fundLines=lines.filter(l=>/\bfund\b/i.test(l)&&!/^(email|website|telephone|tel:|abn|afsl|arsn|responsible entity)/i.test(l));
      if(fundLines.length){
        name=fundLines.sort((a,b)=>b.length-a.length)[0]
          .split(/\s+(?:Telephone|Email|Website|ABN|AFSL|ARSN)\b.*/i)[0].trim();
      }
    }
    const labels={};
    MFD_LABELS.forEach(([lcode])=>{
      const raw=amitNearestAmount(section,lcode);
      if(raw!=null){
        const neg=/^\(.*\)$/.test(raw);
        let val=num(raw.replace(/[(),]/g,''));
        if(neg)val=-val;
        labels[lcode]=val;
      }
    });
    out.push({checked:true,code,name,labels,rawText:section.slice(0,1500)});
  });
  return out;
}
function amitImportFile(input){
  const file=input.files[0];if(!file)return;
  AMIT_IMPORT_FILE=file;
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      await loadPDFJSLib();
      const text=await amitExtractText(reader.result);
      const rows=amitParseSections(text);
      if(!rows.length){toast("Couldn't find any AMIT statements in that PDF — check the file, or enter labels manually below");AMIT_IMPORT_ROWS=[];}
      else AMIT_IMPORT_ROWS=rows;
      render();
    }catch(e){toast('Could not read PDF: '+e.message);}
  };
  reader.onerror=()=>toast('Could not read file');
  reader.readAsArrayBuffer(file);
}
function amitImportCellChange(i,field,value){
  if(!AMIT_IMPORT_ROWS||!AMIT_IMPORT_ROWS[i])return;
  const r=AMIT_IMPORT_ROWS[i];
  if(field==='checked')r.checked=value;
  else if(field==='code')r.code=String(value||'').trim().toUpperCase();
  else if(field==='name')r.name=value;
  else r.labels[field]=num(value);
  render();
}
function amitImportToggleAll(checked){
  if(!AMIT_IMPORT_ROWS)return;
  AMIT_IMPORT_ROWS.forEach(r=>r.checked=checked);
  render();
}
function amitImportConfirm(){
  if(!AMIT_IMPORT_ROWS)return;
  const rows=AMIT_IMPORT_ROWS.filter(r=>r.checked&&r.code);
  if(!rows.length){toast('No funds selected — make sure each row has a code');return;}
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const mfAssets=assetsForPerson([pid]).filter(a=>a.kind==='managed_fund');
  DB.platforms=DB.platforms||[];
  const platform=AMIT_IMPORT_PLATFORM||'Superhero';
  if(!DB.platforms.includes(platform))DB.platforms.push(platform);
  let created=0,updated=0;
  const B=PD();
  const receiptId=AMIT_IMPORT_FILE?uid():null;
  const receiptName=AMIT_IMPORT_FILE?AMIT_IMPORT_FILE.name:null;
  const touchedFunds=[];
  rows.forEach(r=>{
    // Match by code AND platform so the same ETF on two platforms stays separate
    let asset=mfAssets.find(a=>(a.code||'').toUpperCase()===r.code&&(a.platform||'')=== platform);
    if(!asset){
      asset={id:uid(),pid,name:r.name||r.code,kind:'managed_fund',code:r.code,platform,costs:[],transactions:[]};
      DB.assets.push(asset);mfAssets.push(asset);created++;
    }
    let fund=B.funds.find(f=>f.assetId===asset.id);
    if(!fund){fund={id:uid(),code:r.code,name:asset.name,platform,labels:{},assetId:asset.id};B.funds.push(fund);}
    else updated++;
    fund.labels={...fund.labels,...r.labels};
    fund.platform=platform;
    if(receiptId){fund.receiptId=receiptId;fund.receiptName=receiptName;}
    touchedFunds.push(fund);
  });
  const fileToUpload=AMIT_IMPORT_FILE;
  AMIT_IMPORT_ROWS=null;AMIT_IMPORT_FILE=null;
  save();render();
  toast(`Imported ${rows.length} fund${rows.length===1?'':'s'}${created?` · created ${created} new asset${created===1?'':'s'}`:''}${updated?` · updated ${updated} existing`:''}`);
  if(fileToUpload&&receiptId){
    rcptPut({id:receiptId,name:fileToUpload.name,type:fileToUpload.type,blob:fileToUpload},{fy:fyDisplay(FY()),category:'Managed Funds',date:todayISO(),itemName:'AMIT statement',pid}).then(()=>{toast('Statement attached');render();}).catch(()=>{toast("Couldn't attach statement — try again");});
  }
}
function amitImportPanel(){
  if(AMIT_IMPORT_ROWS===null)return'';
  const platOpts=(DB.platforms||['Superhero']).map(p=>`<option value="${esc(p)}" ${AMIT_IMPORT_PLATFORM===p?'selected':''}>${esc(p)}</option>`).join('');
  const platPicker=`<div class="kv" style="margin-bottom:12px"><span class="k">Platform these holdings are on</span>
    <select class="input" style="width:auto;display:inline-block" onchange="AMIT_IMPORT_PLATFORM=this.value;render()">${platOpts}</select></div>`;
  if(!AMIT_IMPORT_ROWS.length){
    return `<div class="card"><div class="chead"><h2>Import AMIT statement</h2><button class="btn ghost small" onclick="amitImportCancel()">✕ Close</button></div>
      <div class="cbody">${platPicker}
        <div class="kv"><span class="k">AMIT member annual statement (PDF)</span>
          <input type="file" class="input" accept=".pdf,application/pdf" style="max-width:280px" onchange="amitImportFile(this)"></div>
        <div class="hint mt">Upload the PDF from your broker. Platform matters if you hold the same ETF on multiple platforms — each gets its own asset and tax labels. Funds not already held at this platform will be created automatically.</div>
      </div></div>`;
  }
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const mfAssets=assetsForPerson([pid]).filter(a=>a.kind==='managed_fund');
  const checkedCount=AMIT_IMPORT_ROWS.filter(r=>r.checked).length;
  const platform=AMIT_IMPORT_PLATFORM||'Superhero';
  const rows=AMIT_IMPORT_ROWS.map((r,i)=>{
    const exists=r.code&&mfAssets.some(a=>(a.code||'').toUpperCase()===r.code&&(a.platform||'')===platform);
    const labelCells=MFD_LABELS.map(([code,desc])=>`<td><input class="input money" style="width:60px" title="${esc(desc)}" value="${r.labels[code]??''}" onchange="amitImportCellChange(${i},'${code}',this.value)"></td>`).join('');
    const noneFound=!Object.keys(r.labels).length;
    return `<tr>
      <td><input type="checkbox" ${r.checked?'checked':''} onchange="amitImportCellChange(${i},'checked',this.checked)"></td>
      <td><input class="input" style="width:70px;text-transform:uppercase" value="${esc(r.code)}" onchange="amitImportCellChange(${i},'code',this.value)"></td>
      <td><input class="input" style="width:170px" value="${esc(r.name)}" onchange="amitImportCellChange(${i},'name',this.value)"></td>
      ${labelCells}
      <td style="font-size:.68rem;white-space:nowrap">${r.code?(exists?`<span class="badge euc">existing on ${esc(platform)}</span>`:'<span class="badge gold">new asset</span>'):'<span class="muted">enter code</span>'}${noneFound?` <span class="badge gold" style="cursor:pointer" onclick="amitToggleDebug(${i})" title="No label amounts were auto-detected for this fund">⚠ none found</span>`:` <a href="#" onclick="amitToggleDebug(${i});return false" style="font-size:.68rem">view text</a>`}</td>
    </tr>
    ${AMIT_DEBUG_OPEN===i?`<tr><td colspan="${3+MFD_LABELS.length+1}"><div class="hint" style="white-space:pre-wrap;font-family:monospace;font-size:.7rem;max-height:200px;overflow-y:auto;background:var(--surface2);padding:8px;border-radius:6px">${esc(r.rawText||'(no text captured)')}</div></td></tr>`:''}`;
  }).join('');
  return `<div class="card"><div class="chead"><h2>Import AMIT statement</h2>
      <span class="actions">
        <button class="btn ghost small" onclick="amitImportToggleAll(true)">Select all</button>
        <button class="btn ghost small" onclick="amitImportToggleAll(false)">Deselect all</button>
        <button class="btn ghost small" onclick="amitImportCancel()">✕ Cancel</button>
        <button class="btn primary small" onclick="amitImportConfirm()">Import ${checkedCount} selected</button>
      </span></div>
    <div class="cbody tight">${platPicker}<table class="tbl"><thead><tr>
      <th></th><th>Code</th><th>Fund</th>${MFD_LABELS.map(([code,desc])=>`<th class="num" title="${esc(desc)}" style="cursor:help;border-bottom:1px dotted var(--muted)">${code}</th>`).join('')}<th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <div class="note">Found ${AMIT_IMPORT_ROWS.length} fund${AMIT_IMPORT_ROWS.length===1?'':'s'} in the PDF. PDF extraction is a best guess — double-check the code, name and label amounts against your statement. Importing into <b>${esc(fyDisplay(FY()))}</b> on platform <b>${esc(platform)}</b>.</div>
    </div>`;
}
PAGES.funds=m=>{
  const y=FY(),B=PD();
  head(m,'ETF / Managed Funds',`Annual-statement labels per fund, plus end-of-year units & value for the net worth report.`,
    `<button class="btn" onclick="amitImportOpen()">⇪ Import AMIT statement</button><button class="btn primary" onclick="fundAdd()">+ Add fund / ETF</button>`);
  const importPanel=amitImportPanel();
  if(importPanel)m.insertAdjacentHTML('beforeend',importPanel);
  const cols=MFD_LABELS.map(l=>`<th class="num" title="${esc(l[1])}" style="cursor:help;border-bottom:1px dotted var(--muted)">${l[0]}</th>`).join('');
  const rows=B.funds.map((f,i)=>{
    // Always display the platform from the linked asset (source of truth), falling back to fund.platform
    const linkedAsset=f.assetId?DB.assets.find(a=>a.id===f.assetId):null;
    const displayPlatform=linkedAsset?.platform||f.platform||'';
    if(linkedAsset?.platform&&f.platform!==linkedAsset.platform){f.platform=linkedAsset.platform;} // sync silently
    const cells=MFD_LABELS.map(l=>`<td class="num" title="${esc(l[1])}">${num(f.labels?.[l[0]])?fmt$(f.labels[l[0]]):'<span class="muted">–</span>'}</td>`).join('');
    return `<tr><td><b>${esc(f.code)}</b> ${f.receiptId?`<span class="rcpt-file" style="font-size:.74rem" onclick="rcptView('${f.receiptId}','${esc(f.code)} statement')">📎</span>`:''}<div class="muted" style="font-size:.74rem">${esc(f.name||'')}</div></td><td>${esc(displayPlatform)}</td>${cells}
      <td class="rowact"><button class="btn ghost small" onclick="fundAdd(${i})">Edit</button>
      <button class="btn ghost small" onclick="if(!lockedGuard())confirmDel('Delete ${esc(f.code)}?',()=>{fundDeleteRow(${i})})">✕</button></td></tr>`;
  }).join('');
  const totals=MFD_LABELS.map(l=>`<td class="num">${fmt$(B.funds.reduce((s,f)=>s+num(f.labels?.[l[0]]),0))}</td>`).join('');
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="cbody tight" style="overflow-x:auto"><table class="tbl" style="min-width:1100px">
    <thead><tr><th>Fund / security</th><th>Platform</th>${cols}<th></th></tr></thead>
    <tbody>${rows||'<tr><td colspan="14" class="muted">No funds yet — add your ETFs and fill in the annual statement labels after 30 June.</td></tr>'}
    <tr class="total"><td colspan="2">Totals</td>${totals}<td></td></tr></tbody></table></div></div>
    <div class="note">Label codes match the letters on your fund's AMIT annual statement. Hover a column header for its full description. <b>Common source of error:</b> your statement shows single letters — <b>Label C</b> (13C, franked distributions = income) is different from <b>Label Y</b> (13Y, other deductions = deduction). Check your statement carefully for rows labelled "Y" and enter them in the 13Y column, not 13C. <b>13L/13U/13C/18A/20E/20F</b> count as assessable income, <b>13Q/20O</b> as tax offsets, <b>13Y</b> as a deduction, and <b>18H/20M</b> are memo fields (kept for reference, not summed into tax calculations). Track unit quantity and market value in <a href="#" onclick="go('assets');return false">Assets → Shares</a>.</div>`);
  // cash distributions received during the year (table only — see the pie
  // chart above the table for a per-fund comparison; AMIT statements are
  // yearly, so a month-by-month breakdown isn't meaningful here)
  const FP=(B.fundPayments=B.fundPayments||[]);
  const fpRows=FP.slice().sort((a,b)=>a.date<b.date?-1:1).map((p,i)=>`<tr><td><b>${esc(p.code)}</b></td><td>${fmtDate(p.date)}</td><td class="num">${fmt$(p.amount)}</td>
    <td class="rowact"><button class="btn ghost small" onclick="fpAdd(${i})">Edit</button>
    <button class="btn ghost small" onclick="if(!lockedGuard())confirmDel('Delete this distribution?',()=>{PD().fundPayments.splice(${i},1);save();render()})">✕</button></td></tr>`).join('');
  // Per-fund comparison — total assessable + offset amounts across the
  // AMIT labels (excluding 18H/20M, which are memo fields already
  // reflected in 18A/20E per the note above the main table).
  const fundTotals=B.funds.map(f=>({
    label:f.code,
    value:MFD_LABELS.filter(l=>l[0]!=='18H'&&l[0]!=='20M').reduce((s,l)=>s+num(f.labels?.[l[0]]),0),
  })).filter(f=>f.value>0);
  m.insertAdjacentHTML('beforeend',`
  <div class="card"><div class="chead"><h2>Distribution comparison by fund</h2>
    <button class="btn small" onclick="fpAdd()">+ Log distribution</button></div>
    <div class="cbody">${fundTotals.length?pieChartSVG(fundTotals,{aria:'Total distribution by fund'}):'<div class="hint">Fill in AMIT statement labels above to compare funds here.</div>'}
    ${FP.length?`<table class="tbl mt"><thead><tr><th>Fund</th><th>Date</th><th class="num">Amount</th><th></th></tr></thead><tbody>${fpRows}</tbody></table>`:'<div class="hint mt">Log each cash distribution as it lands if you want a record separate from the annual tax labels above.</div>'}
  </div></div>`);
};
function mfAssetPick(assetId){
  if(!assetId)return;
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  if($('#f_code'))$('#f_code').value=a.code||'';
  if($('#f_name'))$('#f_name').value=a.name||'';
  if(a.platform&&$('#f_plat')&&!$('#f_plat').value)$('#f_plat').value=a.platform;
}
function fpAdd(i){
  if(lockedGuard())return;
  const B=PD(),p=i!=null?B.fundPayments[i]:{code:(B.funds[0]||{}).code||'',date:todayISO(),amount:''};
  const codes=[...new Set(B.funds.map(f=>f.code))];
  modal(i!=null?'Edit distribution':'Log cash distribution',`
    <div class="fldrow"><div><label class="fld">Fund</label>
      ${codes.length?`<select id="f_c" class="input">${codes.map(c=>`<option ${p.code===c?'selected':''}>${c}</option>`).join('')}</select>`:`<input id="f_c" class="input" value="${esc(p.code)}" style="text-transform:uppercase" placeholder="e.g. VAS">`}</div>
    <div><label class="fld">Date received</label><input id="f_d" type="date" class="input" value="${p.date}"></div>
    <div><label class="fld">Amount ($)</label><input id="f_a" class="input money" value="${p.amount}"></div></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="fpSave(${i==null?'null':i})">Save</button>`);
}
function fpSave(i){
  const B=PD();
  const p={id:i!=null?B.fundPayments[i].id:uid(),code:$('#f_c').value.trim().toUpperCase()||'???',date:$('#f_d').value,amount:num($('#f_a').value)};
  if(i!=null)B.fundPayments[i]=p;else B.fundPayments.push(p);
  save();closeModal();render();toast('Distribution logged');
}
async function asxApiSearch(q){
  // Best effort — the ASX endpoint usually blocks cross-origin browser calls, so we fall back to the built-in list.
  try{
    const r=await fetch(`https://asx.api.markitdigital.com/asx-research/1.0/companies/directory?page=0&itemsPerPage=10&query=${encodeURIComponent(q)}`,{mode:'cors'});
    if(!r.ok)throw 0;const j=await r.json();
    return (j.data?.items||[]).map(x=>[x.symbol,x.displayName]);
  }catch(e){return null;}
}
function fundDeleteRow(i){
  const f=PD().funds[i];
  if(!f)return;
  PD().funds.splice(i,1);
  if(f.receiptId&&!receiptStillReferenced(f.receiptId))rcptDel(f.receiptId).catch(()=>{});
  save();render();
}
function fundAdd(i){
  if(lockedGuard())return;
  const y=FY(),B=PD();
  const mfAssets=(typeof assetsForPerson==='function')?assetsForPerson([DB.currentPid]).filter(a=>a.kind==='managed_fund'):[];
  // Require an asset to be set up first (when adding new; editing existing is always allowed)
  if(i==null&&!mfAssets.length){
    modal('Add managed fund / ETF',`
      <div style="text-align:center;padding:16px 0 8px">
        <div style="font-size:2rem;margin-bottom:10px">📊</div>
        <p style="font-weight:600;font-size:1rem;margin-bottom:8px">Set up your managed fund as an asset first</p>
        <p class="muted" style="line-height:1.6">Go to <b>Assets → + Add asset → ETF / Managed Fund</b> to register the fund with its ASX code and unit tracking. Once created, you can come back here to log annual statement labels (13U, 13C, etc.) against it.</p>
      </div>`,
      `<button class="btn" data-close>Cancel</button>
       <button class="btn primary" onclick="closeModal();go('assets')">Go to Assets ↗</button>`);
    return;
  }
  const f=i!=null?B.funds[i]:{code:'',name:'',platform:(DB.platforms||[])[0]||'',labels:{},assetId:mfAssets.length===1?mfAssets[0].id:''};
  const mfOpts=mfAssets.map(a=>`<option value="${a.id}" ${f.assetId===a.id?'selected':''}>${esc(a.name)}${a.code?' ('+esc(a.code)+')':''}</option>`).join('');
  const labelFlds=MFD_LABELS.map(l=>`<div><label class="fld" title="${esc(l[1])}">${l[0]}</label><input class="input money mfd" data-l="${l[0]}" value="${f.labels?.[l[0]]??''}"></div>`).join('');
  const linked=f.assetId?mfAssets.find(a=>a.id===f.assetId):null;
  modal(i!=null?'Edit fund':'Add managed fund / ETF',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Fund / ETF asset</label>
      <select id="f_mfaid" class="input" onchange="mfAssetPick(this.value)"><option value="">— select fund —</option>${mfOpts}</select></div>
    <div><label class="fld">Platform</label><input id="f_plat" class="input" value="${esc(f.platform)}" list="platforms"><datalist id="platforms">${platOptions()}</datalist></div></div>
    ${linked?`<div class="note" style="margin-top:8px">Logging ATO labels for <b>${esc(linked.name)}</b>${linked.code?' ('+esc(linked.code)+')':''} in ${esc(fyDisplay(y))}</div>`:''}
    <!-- hidden fields for save compatibility -->
    <input type="hidden" id="f_code" value="${esc(f.code)}">
    <input type="hidden" id="f_name" value="${esc(f.name)}">
    <h3 class="mt" style="font-size:.9rem">Annual statement labels ($)</h3>
    <div class="fldrow mt" style="row-gap:10px">${labelFlds}</div>
    ${i!=null?`<div class="hint mt">${f.receiptId?`📎 Statement attached: ${esc(f.receiptName||'file')} — <a href="#" onclick="closeModal();fundAttachOpen('${f.id}');return false">replace or remove</a>`:`<a href="#" onclick="closeModal();fundAttachOpen('${f.id}');return false">+ Attach a statement</a> for this fund`}</div>`:''}`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="fundSave(${i==null?'null':i})">Save</button>`);
}
function fundAttachOpen(id){
  const f=PD().funds.find(x=>x.id===id);
  if(!f)return;
  modal('Attach statement',`
    <div class="hint">Attach the AMIT annual statement this fund's labels came from — the PDF you imported, or a screenshot of the platform's record.</div>
    <div class="mt"><label class="fld">File ${f.receiptId?'(replaces existing)':''}</label><input id="f_rcpt" type="file" class="input" accept="image/*,.pdf,.csv,.xlsx,.xls"></div>`,
    `<button class="btn" data-close>Cancel</button>${f.receiptId?`<button class="btn ghost" onclick="fundDetachStatement('${id}')">Remove</button>`:''}<button class="btn primary" onclick="fundAttachSave('${id}')">Attach</button>`);
}
async function fundAttachSave(id){
  const f=PD().funds.find(x=>x.id===id);
  if(!f)return;
  const file=$('#f_rcpt')?.files[0];
  if(!file)return toast('Choose a file first');
  const oldRid=f.receiptId;
  f.receiptId=uid();f.receiptName=file.name;
  closeModal();save();render();
  toast('Attaching…');
  try{
    await rcptPut({id:f.receiptId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(FY()),category:'Managed Funds',date:todayISO(),itemName:f.code+' statement',pid:isAll()?DB.people[0].id:DB.currentPid});
    if(oldRid&&!receiptStillReferenced(oldRid))await rcptDel(oldRid).catch(()=>{});
    toast('Statement attached');render();
  }catch(e){toast("Couldn't attach statement — try again");}
}
function fundDetachStatement(id){
  const f=PD().funds.find(x=>x.id===id);
  if(!f)return;
  if(f.receiptId)rcptDel(f.receiptId).catch(()=>{});
  f.receiptId='';f.receiptName='';
  closeModal();save();render();toast('Attachment removed');
}
function fundSave(i){
  const labels={};$$('.mfd').forEach(el=>{if(el.value!=='')labels[el.dataset.l]=num(el.value);});
  const f={id:i!=null?PD().funds[i].id:uid(),code:$('#f_code').value.trim().toUpperCase()||'???',
    name:$('#f_name').value.trim(),platform:$('#f_plat').value.trim(),labels,
    assetId:$('#f_mfaid')?$('#f_mfaid').value:''};
  if(i!=null)PD().funds[i]=f;else PD().funds.push(f);
  save();closeModal();render();toast('Fund saved');
}

/* ================= SHARE SALES ================= */
PAGES.sales=m=>{
  const y=FY(),B=PD();
  head(m,'Share sales',`Capital gains and losses realised in ${esc(y.label)}.`,
    `<button class="btn primary" onclick="saleAdd()">+ Add sale</button>`);
  const cgt=cgtBreakdown(B);
  const rows=B.sales.map((s,i)=>{
    const gross=num(s.proceeds)-num(s.costBase);
    const heldDays=s.buyDate&&s.sellDate?(new Date(s.sellDate+'T00:00:00Z')-new Date(s.buyDate+'T00:00:00Z'))/86400000:0;
    const eligible=gross>0&&heldDays>=365;
    return `<tr><td><b>${esc(s.code)}</b>${s.auto?' <span class="badge blue" style="font-size:.65rem" title="Auto-calculated from a sell transaction in Assets">auto</span>':''}</td><td>${fmtDate(s.buyDate)}</td><td>${fmtDate(s.sellDate)}</td>
      <td class="num">${fmt$(s.costBase)}</td><td class="num">${fmt$(s.proceeds)}</td>
      <td class="num" style="color:${gross>=0?'var(--euc)':'var(--red)'}">${fmt$(gross)}</td>
      <td>${gross>0?(eligible?'<span class="badge euc">50% discount</span>':'<span class="muted" style="font-size:.78rem">held &lt;12mo</span>'):''}</td>
      <td class="rowact"><button class="btn ghost small" onclick="saleAdd(${i})">Edit</button>
      <button class="btn ghost small" onclick="if(!lockedGuard())confirmDel('Delete this sale?',()=>{PD().sales.splice(${i},1);save();render()})">✕</button></td></tr>`;
  }).join('');
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="cbody tight"><table class="tbl">
    <thead><tr><th>Code</th><th>Acquired</th><th>Sold</th><th class="num">Cost base</th><th class="num">Proceeds</th><th class="num">Gain / loss</th><th>CGT discount</th><th></th></tr></thead>
    <tbody>${rows||'<tr><td colspan="8" class="muted">No sales recorded for this year.</td></tr>'}</tbody></table></div></div>
  <div class="card"><div class="chead"><h2>Capital gains summary</h2><span class="hint">share sales + fund/trust distributions, combined</span></div>
  <div class="cbody"><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line)">
    <div style="flex:1;min-width:220px">
      <b>Capital losses carried forward from prior years</b>
      <div class="muted" style="font-size:.84rem;margin-top:2px">From your most recent Notice of Assessment ("Net capital losses carried forward to later income years") — applied against this year's gains before the 50% discount.</div>
    </div>
    <input class="input money" style="max-width:160px" value="${num(B.priorCapitalLosses)||''}" placeholder="0.00"
      onchange="PD().priorCapitalLosses=num(this.value);save();render()">
  </div><table class="tbl">
    <tbody>
    <tr class="total"><td>Gross capital gain (before losses/discount) — shares + funds</td><td class="num">${fmt$(cgt.grossGain)}</td></tr>
    ${cgt.loss?`<tr><td>Current year capital losses</td><td class="num" style="color:var(--red)">−${fmt$(cgt.loss)}</td></tr>`:''}
    ${cgt.priorLosses?`<tr><td>Prior year losses applied (of ${fmt$(cgt.priorLosses)} available)</td><td class="num" style="color:var(--red)">−${fmt$(cgt.priorLosses-cgt.lossesCarriedForward)}</td></tr>`:''}
    ${cgt.discountAfterLoss?`<tr><td>50% discount on remaining eligible gain</td><td class="num" style="color:var(--red)">−${fmt$(cgt.discountAfterLoss*0.5)}</td></tr>`:''}
    <tr class="total"><td><b>Net capital gain (assessable)</b></td><td class="num"><b>${fmt$(cgt.netCG)}</b></td></tr>
    ${cgt.lossesCarriedForward?`<tr><td>Net capital losses carried forward to next FY</td><td class="num">${fmt$(cgt.lossesCarriedForward)}</td></tr>`:''}
    </tbody></table></div></div>
    <div class="note">Rows marked <b>auto</b> were generated automatically from a "sell" transaction recorded against a Shares asset in <a href="#" onclick="go('assets');return false">Assets</a> — edit the transaction there to change them, rather than editing here directly (your edit would be overwritten next time the transaction is saved). Assets held 12 months or more (approximated as 365+ days between Acquired and Sold) qualify for the 50% CGT discount — losses are offset against non-discount-eligible gains first since that gives the lowest net gain, matching the order the ATO recommends. Capital gains distributed by ETFs/managed funds (label 18A on their AMIT statement, see <a href="#" onclick="go('funds');return false">ETF / Managed Funds</a>) are pooled into this same calculation, since the ATO applies all available losses against every capital gain for the year together, not per source. This is a simplification: it doesn't model residency changes, inherited assets, small business concessions, fund gains taxed under the "other method" (non-discount), or assets acquired before 21 September 1999 — check exact boundary cases and anything unusual with a registered tax agent before lodging.</div>`);
};
function saleAdd(i){
  if(lockedGuard())return;
  const B=PD(),s=i!=null?B.sales[i]:{code:'',buyDate:'',sellDate:todayISO(),costBase:'',proceeds:''};
  modal(i!=null?'Edit sale':'Add share sale',`
    ${secSearchBox('#f_c')}
    <div class="fldrow mt"><div><label class="fld">Security code</label><input id="f_c" class="input" value="${esc(s.code)}" style="text-transform:uppercase"></div>
    <div><label class="fld">Acquired</label><input id="f_b" type="date" class="input" value="${s.buyDate}"></div>
    <div><label class="fld">Sold</label><input id="f_s" type="date" class="input" value="${s.sellDate}"></div></div>
    <div class="fldrow mt"><div><label class="fld">Cost base incl. fees ($)</label><input id="f_cb" class="input money" value="${s.costBase}"></div>
    <div><label class="fld">Sale proceeds ($)</label><input id="f_pr" class="input money" value="${s.proceeds}"></div></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="saleSave(${i==null?'null':i})">Save</button>`);
}
function saleSave(i){
  const s={id:i!=null?PD().sales[i].id:uid(),code:$('#f_c').value.trim().toUpperCase()||'???',buyDate:$('#f_b').value,sellDate:$('#f_s').value,costBase:num($('#f_cb').value),proceeds:num($('#f_pr').value)};
  if(i!=null)PD().sales[i]=s;else PD().sales.push(s);
  save();closeModal();render();toast('Sale saved');
}
/* ================= EXPENSES ================= */
PAGES.expenses=m=>{
  const y=FY(),B=PD();
  head(m,'Expenses',`Regular and one-off outgoings for ${esc(fyDisplay(y))} — with optional deduction linking for investment property costs.`,
    `<button class="btn" onclick="expReceiptScan()">📷 Scan receipt</button>
     <button class="btn primary" onclick="expAdd()">+ Add expense</button>`);

  const exps=B.expenses||[];
  // Group by recurrence
  const byRec={};
  exps.forEach((e,i)=>{(byRec[e.recurrence]=byRec[e.recurrence]||[]).push({...e,_i:i});});

  // Monthly expenses chart (expenses only — income has its own chart on the Income page)
  const expMo=expensesMonthlyForFY(B);
  const chartData=FY_MONTHS.map((label,i)=>({label,value:expMo[i]||0}));

  let body='',grand=0,dedTotal=0;
  const sorted=['monthly','fortnightly','weekly','quarterly','yearly','once'];
  sorted.concat(Object.keys(byRec).filter(k=>!sorted.includes(k))).forEach(rec=>{
    if(!byRec[rec])return;
    const grpTotal=byRec[rec].reduce((s,e)=>s+yearlyFromRec(num(e.amount),e.recurrence),0);
    grand+=grpTotal;
    const label=RECURRENCE_OPTS.find(([v])=>v===rec)?.[1]||rec;
    body+=`<tr class="subhead"><td colspan="7">${label} — ${fmt$0(grpTotal)}/yr</td></tr>`;
    byRec[rec].forEach(e=>{
      const yearly=yearlyFromRec(num(e.amount),e.recurrence);
      const dedAmt=expDeductibleAmt(e);
      if(e.isDeductible)dedTotal+=yearlyFromRec(dedAmt,e.recurrence);
      const isOnce=e.recurrence==='once';
      const asset=e.assetId?DB.assets.find(a=>a.id===e.assetId):null;
      body+=`<tr>
        <td><b>${esc(e.name)}</b><div class="muted" style="font-size:.74rem">${esc(e.category||'')}${e.schedDay?' · day '+e.schedDay:''}${e.date?' · '+fmtDate(e.date):''}</div></td>
        <td class="num">${isOnce?'<span class="muted">—</span>':fmt$(e.amount)}</td>
        <td class="num">${fmt$0(yearly)}</td>
        <td>${e.isDeductible?(e.isWorkDevice?`<span class="badge blue">🖥️ Work device</span> <button class="btn ghost small" style="padding:1px 6px;height:auto" onclick="devDetail('${e.linkedDeviceId}','')">View schedule</button>`:`<span class="badge euc">✓ ${fmt$0(yearlyFromRec(dedAmt,e.recurrence))}/yr deductible</span>${asset?`<br><span class="badge gold" style="font-size:.68rem">${esc(asset.name)}</span>`:''}`):''}</td>
        <td class="rowact">
          <button class="btn ghost small" onclick="expAttachFile(${e._i})" title="${e.receiptId?'View/replace receipt':'Attach receipt'}">${e.receiptId?'📎':'📎+'}</button>
          <button class="btn ghost small" onclick="expAdd(${e._i})">Edit</button>
          <button class="btn ghost small" onclick="if(!lockedGuard())expDelete(${e._i})">✕</button>
        </td></tr>`;
    });
  });

  // Investment property expenses entered via Assets → property card →
  // Investment property expenses from Assets
  const propExps=(B.property?.expenses||[]).slice().sort((x,y)=>x.date<y.date?1:-1);
  const propExpTotal=propExps.reduce((s,e)=>s+num(e.amount),0);
  const propDedTotal=propExps.reduce((s,e)=>s+propExpDeductible(e),0);
  const propRows=propExps.map(e=>{
    const ded=propExpDeductible(e),full=num(e.amount);
    const dedLabel=ded>=full?'✓ fully deductible':`${fmt$0(ded)} deductible`;
    return `<tr>
        <td><b>${esc(e.item||e.category)}</b><div class="muted" style="font-size:.74rem">${esc(e.category)} · ${fmtDate(e.date)} <span class="badge gold" style="font-size:.68rem">Investment Property</span></div></td>
        <td class="num muted">—</td>
        <td class="num">${fmt$0(full)}</td>
        <td><span class="badge euc">${dedLabel}</span></td>
        <td class="rowact"><a href="#" onclick="go('assets');return false" class="btn ghost small">Edit in Assets</a></td></tr>`;}).join('');

  // Management fee — computed from rental income × fee%, prorated from purchase date
  const propertyAssets=(typeof assetsForPerson==='function')
    ?assetsForPerson(isAll()?DB.people.map(p=>p.id):[DB.currentPid]).filter(a=>a.kind==='property'&&a.investment!==false):[];
  let mgmtFeeTotal=0,mgmtFeeRows='';
  propertyAssets.forEach(a=>{
    const fee=managementFeeForFY(a,y);
    if(!fee)return;
    mgmtFeeTotal+=fee;
    const curRate=managementFeeCurrentRate(a);
    mgmtFeeRows+=`<tr>
      <td><b>Property management fee</b><div class="muted" style="font-size:.74rem">${esc(a.name)}${curRate?` · ${curRate.pct}% of rent`:''} <span class="badge gold" style="font-size:.68rem">Investment Property</span></div></td>
      <td class="num muted">—</td>
      <td class="num">${fmt$0(fee)}</td>
      <td><span class="badge euc">✓ fully deductible</span></td>
      <td class="rowact"><a href="#" onclick="go('assets');return false" class="btn ghost small">Edit in Assets</a></td></tr>`;
  });

  const yearlyTotal=grand+propExpTotal+mgmtFeeTotal, monthlyAvg=yearlyTotal/12;
  const dedTotalAll=dedTotal+propDedTotal+mgmtFeeTotal;
  const incYearly=cashIncomeYearly(B,isAll()?DB.people[0].id:DB.currentPid,y);
  const surplus=incYearly-yearlyTotal;

  m.insertAdjacentHTML('beforeend',`
  <div class="grid3" style="margin-bottom:18px">
    <div class="stat bad"><div class="l">Total expenses / year</div><div class="v">${fmt$0(yearlyTotal)}</div><div class="d">${fmt$0(monthlyAvg)}/mo avg.</div></div>
    <div class="stat euc"><div class="l">Deductible portion</div><div class="v">${fmt$0(dedTotalAll)}</div><div class="d">linked to deductions sections</div></div>
    <div class="stat ${surplus>=0?'good':'bad'}"><div class="l">Income vs expenses</div><div class="v">${fmt$0(Math.abs(surplus))}</div><div class="d">${surplus>=0?'annual surplus':'annual shortfall'}</div></div>
  </div>
  <div class="card"><div class="cbody tight"><table class="tbl">
    <thead><tr><th>Expense</th><th class="num">Per period</th><th class="num">Yearly</th><th>Deduction</th><th></th></tr></thead>
    <tbody>${body||propRows||mgmtFeeRows?'':'<tr><td colspan="5" class="muted">No expenses yet — add your mortgage, rent, car payments, subscriptions…</td></tr>'}${body}${propRows}${mgmtFeeRows}
    ${yearlyTotal?`<tr class="total"><td>Total yearly outgoings</td><td></td><td class="num">${fmt$0(yearlyTotal)}</td><td></td><td></td></tr>`:''}
    </tbody></table></div></div>
  ${dedTotalAll?`<div class="note">Deductible expenses are automatically included in the <b>Other deductions</b> and <b>Investment property</b> sections — no double entry needed. Management fees are auto-calculated from the rental income × fee % set in Assets. Investment property expenses are shown here for reference — edit them in Assets.</div>`:''}
  <div class="card"><div class="chead"><h2>Monthly expenses — ${esc(fyDisplay(y))}</h2><span class="hint">recurring and one-off outgoings by month — includes property expenses and management fees</span></div>
    <div class="cbody">${barChartSVG(chartData,{aria:'Monthly expenses',color:'var(--red)'})}</div></div>`);
};
/* ---- AI receipt / invoice scanning ---- */
function expReceiptScan(){
  if(lockedGuard())return;
  modal('Scan receipt / invoice',`
    <div class="hint">Upload a photo or PDF of a receipt or invoice — Claude will extract the date, amount, and likely category. You'll review and confirm before anything is saved.</div>
    <div class="mt"><label class="fld">Receipt or invoice</label>
      <input id="f_rcpt_file" type="file" class="input" accept="image/*,.pdf" onchange="expReceiptProcess(this)"></div>
    <div id="rcptScanStatus" class="note mt" style="display:none">Analysing…</div>
    <div id="rcptScanResult" style="display:none"></div>`,
    `<button class="btn" data-close>Cancel</button><button id="rcptScanApply" class="btn primary" style="display:none" onclick="expReceiptApply()">Use these details</button>`);
}
let _rcptExtracted=null;
async function expReceiptProcess(input){
  const file=input.files[0];if(!file)return;
  const status=$('#rcptScanStatus'),result=$('#rcptScanResult');
  if(!status||!result)return;
  status.style.display='block';status.textContent='Analysing receipt…';
  result.style.display='none';
  try{
    const base64=await new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=()=>res(r.result.split(',')[1]);
      r.onerror=()=>rej(new Error('Could not read file'));
      r.readAsDataURL(file);
    });
    const mediaType=file.type||'image/jpeg';
    const isPDF=file.name.toLowerCase().endsWith('.pdf');
    const content=[
      isPDF
        ?{type:'document',source:{type:'base64',media_type:'application/pdf',data:base64}}
        :{type:'image',source:{type:'base64',media_type:mediaType,data:base64}},
      {type:'text',text:`Extract information from this receipt or invoice for an Australian personal finance app. Return ONLY a JSON object with these fields (omit any you can't determine):
{
  "name": "merchant/payee name",
  "date": "YYYY-MM-DD",
  "amount": number (total amount paid in AUD),
  "category": one of: ${EXPENSE_CATS.join(', ')},
  "recurrence": "once",
  "note": "brief description of what was purchased"
}
Return only the JSON object, no other text.`}
    ];
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:400,messages:[{role:'user',content}]})
    });
    const data=await resp.json();
    const text=(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
    const clean=text.replace(/```json?|```/g,'').trim();
    const parsed=JSON.parse(clean);
    _rcptExtracted=parsed;
    const fields=[
      parsed.name?`<div class="kv"><span class="k">Merchant</span><span class="v">${esc(parsed.name)}</span></div>`:'',
      parsed.date?`<div class="kv"><span class="k">Date</span><span class="v">${fmtDate(parsed.date)}</span></div>`:'',
      parsed.amount?`<div class="kv"><span class="k">Amount</span><span class="v">${fmt$(parsed.amount)}</span></div>`:'',
      parsed.category?`<div class="kv"><span class="k">Category</span><span class="v"><span class="badge euc">${esc(parsed.category)}</span></span></div>`:'',
      parsed.note?`<div class="kv"><span class="k">Note</span><span class="v muted">${esc(parsed.note)}</span></div>`:'',
    ].filter(Boolean).join('');
    result.innerHTML=`<div class="card" style="margin-top:10px"><div class="cbody">${fields||'<div class="muted">Could not extract details — the image may be unclear.</div>'}</div></div>`;
    result.style.display='block';
    status.textContent='Done — review the extracted details:';
    const applyBtn=$('#rcptScanApply');if(applyBtn)applyBtn.style.display=parsed.amount?'':'none';
  }catch(e){
    status.textContent='Could not analyse receipt: '+e.message;
    _rcptExtracted=null;
  }
}
function expReceiptApply(){
  if(!_rcptExtracted)return;
  const prefill={
    name:_rcptExtracted.name||'',
    category:_rcptExtracted.category||'Other',
    amount:_rcptExtracted.amount||'',
    recurrence:'once',
    date:_rcptExtracted.date||todayISO(),
    note:_rcptExtracted.note||''
  };
  _rcptExtracted=null;
  closeModal();
  expAdd(null,prefill);
}
/* expAdd(i) — edit row i; expAdd(null, prefill) — new with prefilled data from receipt scan */
/* Deletes an expense and cleans up anything linked to it — a synced
   property expense entry, or a synced work-device depreciation record —
   so neither one is left orphaned/ghosted behind. */
function expDelete(i){
  const B=PD(),e=B.expenses[i];if(!e)return;
  confirmDel(`Delete "${esc(e.name)}"?${e.isWorkDevice?' This also removes its linked depreciation schedule.':''}`,()=>{
    const staleIdx=B.property.expenses.findIndex(pe=>pe.expenseId===e.id);
    if(staleIdx>=0)B.property.expenses.splice(staleIdx,1);
    if(e.isWorkDevice&&e.linkedDeviceId)expRemoveLinkedDevice(e);
    B.expenses.splice(i,1);
    save();render();
  });
}
function expAdd(i, prefill){
  if(lockedGuard())return;
  const B=PD();B.expenses=B.expenses||[];
  const defaults={name:'',category:'Housing',amount:'',recurrence:'monthly',schedDay:'',date:'',isDeductible:false,deductibleMode:'fixed',deductibleAmount:'',deductiblePct:'',propCategory:'Interest',assetId:'',note:''};
  const e=i!=null?B.expenses[i]:(prefill?{...defaults,...prefill}:{...defaults});
  const propAssets=(typeof assetsForPerson==='function')?assetsForPerson([DB.currentPid]).filter(a=>a.kind==='property'):[];
  const propOpts=propAssets.map(a=>`<option value="${a.id}" ${e.assetId===a.id?'selected':''}>${esc(a.name)}</option>`).join('');
  const showDate=e.recurrence==='once'||e.recurrence==='yearly'||!!(prefill&&e.date);
  const title=prefill?'Add expense (from receipt)':i!=null?'Edit expense':'Add expense';
  const dedMode=e.deductibleMode||'fixed';
  modal(title,`
    <div class="fldrow"><div style="flex:2"><label class="fld">Name</label><input id="f_n" class="input" value="${esc(e.name)}" placeholder="e.g. Mortgage repayment, Netflix, Groceries"></div>
    <div><label class="fld">Category</label><select id="f_cat" class="input">${EXPENSE_CATS.map(c=>`<option ${e.category===c?'selected':''}>${c}</option>`).join('')}</select></div></div>
    <div class="fldrow mt"><div><label class="fld">Amount ($) per period</label><input id="f_a" class="input money" value="${e.amount}" oninput="expCalc()"></div>
    <div><label class="fld">Recurrence</label><select id="f_rec" class="input" onchange="expRecChange(this.value)">${RECURRENCE_OPTS.map(([v,l])=>`<option value="${v}" ${e.recurrence===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div><label class="fld" id="schedDayLbl">Day of month</label><input id="f_dm" class="input money" value="${e.schedDay||''}" placeholder="e.g. 15"></div></div>
    <div id="expDateRow" style="display:${showDate?'flex':'none'}" class="fldrow mt">
      <div><label class="fld">Date</label><input id="f_dt" type="date" class="input" value="${e.date||todayISO()}"></div></div>
    <div class="note" id="expCalcHint" style="margin-top:8px"></div>
    <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
    <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" id="f_ded" ${e.isDeductible||e.isWorkDevice?'checked':''} onchange="expDedChange(this.checked)"> This expense has a <b>tax-deductible portion</b></label>
    <div id="expDedFlds" style="display:${e.isDeductible||e.isWorkDevice?'block':'none'}">
      <div class="fldrow">
        <div><label class="fld">Claimable as</label><select id="f_dmode" class="input" onchange="expDedModeChange(this.value)">
          <option value="fixed" ${dedMode==='fixed'&&!e.isWorkDevice?'selected':''}>Fixed $ amount per period</option>
          <option value="percent" ${dedMode==='percent'&&!e.isWorkDevice?'selected':''}>% of the amount per period</option>
          <option value="device" ${e.isWorkDevice?'selected':''}>Work device / equipment (multi-year depreciation)</option></select></div>
        <div id="expDedFixedFld" style="display:${dedMode==='fixed'&&!e.isWorkDevice?'block':'none'}"><label class="fld">Claimable amount ($ per period)</label><input id="f_da" class="input money" value="${e.deductibleAmount||''}" placeholder="e.g. 900 (interest only)"></div>
        <div id="expDedPctFld" style="display:${dedMode==='percent'&&!e.isWorkDevice?'block':'none'}"><label class="fld">Claimable %</label><input id="f_dpct" class="input money" value="${e.deductiblePct||''}" placeholder="e.g. 80" oninput="expDedPctPreview()"></div>
      </div>
      <div class="hint" id="expDedPctHint" style="margin-top:4px"></div>
      <div id="expDeviceFlds" style="display:${e.isWorkDevice?'block':'none'}">
        <div class="note" style="margin-bottom:10px">The full amount above is treated as the device's purchase cost. Instead of a flat one-off deduction, it's claimed via a depreciation schedule on the <a href="#" onclick="go('other');return false">Deductions</a> page — items under the immediate write-off cap are claimed in full this year; dearer items decline in value over their effective life and automatically keep claiming in future FYs.</div>
        <div class="fldrow"><div><label class="fld">Work-related use (%)</label><input id="f_wu" class="input money" value="${e.deviceWorkUse||100}"></div>
        <div><label class="fld">Method</label><select id="f_wm" class="input" onchange="expDeviceHint()">
          <option value="immediate" ${e.deviceMethod==='immediate'||!e.deviceMethod?'selected':''}>Immediate deduction (≤ ${fmt$0(y.rates.deviceImmediateCap)})</option>
          <option value="diminishing" ${e.deviceMethod==='diminishing'?'selected':''}>Decline in value — diminishing value</option>
          <option value="prime" ${e.deviceMethod==='prime'?'selected':''}>Decline in value — prime cost</option></select></div>
        <div><label class="fld">Effective life (years)</label><input id="f_wl" class="input money" value="${e.deviceLife||3}"></div></div>
        <div class="note" id="expDeviceHint" style="margin-top:4px"></div>
        ${e.linkedDeviceId?`<div class="mt"><button class="btn ghost small" onclick="closeModal();devDetail('${e.linkedDeviceId}','')">📊 View depreciation schedule</button></div>`:''}
      </div>
      <div class="fldrow mt" id="expDedCatRow" style="display:${e.isWorkDevice?'none':'flex'}"><div style="flex:2"><label class="fld">Deduction category</label><select id="f_dcat" class="input">
        <optgroup label="Work-related & other">${GENERAL_DED_CATS.map(c=>`<option ${e.propCategory===c?'selected':''}>${c}</option>`).join('')}</optgroup>
        <optgroup label="Investment property">${PROP_CATS.map(c=>`<option ${e.propCategory===c?'selected':''}>${c}</option>`).join('')}</optgroup>
      </select></div>
      <div><label class="fld">ATO D-item <span class="muted">(myTax)</span></label>
        <select id="f_ditem" class="input">
          <option value="">Auto</option>
          <option value="D1" ${e.dedItem==='D1'?'selected':''}>D1 — Car expenses</option>
          <option value="D2" ${e.dedItem==='D2'?'selected':''}>D2 — Travel</option>
          <option value="D3" ${e.dedItem==='D3'?'selected':''}>D3 — Clothing</option>
          <option value="D4" ${e.dedItem==='D4'?'selected':''}>D4 — Self-education</option>
          <option value="D5" ${e.dedItem==='D5'?'selected':''}>D5 — Other work</option>
          <option value="D9" ${e.dedItem==='D9'?'selected':''}>D9 — Donations</option>
          <option value="D10" ${e.dedItem==='D10'?'selected':''}>D10 — Tax affairs</option>
          <option value="D12" ${e.dedItem==='D12'?'selected':''}>D12 — Super</option>
          <option value="D15" ${e.dedItem==='D15'?'selected':''}>D15 — Other</option>
        </select>
      </div></div>
      <div class="fldrow mt" id="expDedAssetRow" style="display:${e.isWorkDevice?'none':'flex'}"><div style="flex:2"><label class="fld">Linked property asset <span class="muted">(optional — only for property-related deductions)</span></label>
        <select id="f_dasset" class="input"><option value="">— no asset link —</option>${propOpts}</select></div></div>
      <div class="note" id="expDedAssetNote" style="display:${e.isWorkDevice?'none':'block'}">If linked to a property, the deductible portion flows through to that property's expenses automatically. Otherwise it's included as a general work-related deduction.</div>
    </div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="expSave(${i==null?'null':i})">Save</button>`);
  setTimeout(()=>{expCalc();expDedPctPreview();expDeviceHint();},30);
}
function expAttachFile(i){
  const B=PD();const e=i!=null?B.expenses[i]:null;if(!e)return;
  modal('Attach receipt',`
    <div class="hint">Attach a receipt or statement for this expense — e.g. a bill, invoice, or bank statement.</div>
    <div class="mt"><label class="fld">File ${e.receiptId?'(replaces existing)':''}</label><input id="f_exp_rcpt" type="file" class="input" accept="image/*,.pdf"></div>
    ${e.receiptId?`<div class="mt"><span class="rcpt-file" onclick="rcptView('${e.receiptId}','${esc(e.receiptName||'receipt')}')">📎 Current: ${esc(e.receiptName||'receipt')}</span></div>`:''}`,
    `<button class="btn" data-close>Cancel</button>${e.receiptId?`<button class="btn ghost" onclick="expDetachReceipt(${i})">Remove</button>`:''}<button class="btn primary" onclick="expAttachSave(${i})">Attach</button>`);
}
async function expAttachSave(i){
  const B=PD();const e=i!=null?B.expenses[i]:null;if(!e)return;
  const file=$('#f_exp_rcpt')?.files[0];if(!file)return toast('Choose a file first');
  const oldRid=e.receiptId;
  e.receiptId=uid();e.receiptName=file.name;
  closeModal();save();render();toast('Attaching…');
  try{
    await rcptPut({id:e.receiptId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(FY()),category:'Other Deductions',date:e.date||todayISO(),itemName:e.name||'Expense',pid:DB.currentPid});
    if(oldRid&&!receiptStillReferenced(oldRid))rcptDel(oldRid).catch(()=>{});
    toast('Receipt attached');render();
  }catch(err){toast("Couldn't attach receipt — try again");}
}
function expDetachReceipt(i){
  const B=PD();const e=i!=null?B.expenses[i]:null;if(!e)return;
  const rid=e.receiptId;delete e.receiptId;delete e.receiptName;
  closeModal();save();render();
  if(rid&&!receiptStillReferenced(rid))rcptDel(rid).catch(()=>{});
  toast('Receipt removed');
}
function expDedChange(v){const el=$('#expDedFlds');if(el)el.style.display=v?'block':'none';}
function expDedModeChange(v){
  const fixedEl=$('#expDedFixedFld'),pctEl=$('#expDedPctFld'),devEl=$('#expDeviceFlds'),
    catRow=$('#expDedCatRow'),assetRow=$('#expDedAssetRow'),assetNote=$('#expDedAssetNote');
  const isDevice=v==='device';
  if(fixedEl)fixedEl.style.display=v==='fixed'?'block':'none';
  if(pctEl)pctEl.style.display=v==='percent'?'block':'none';
  if(devEl)devEl.style.display=isDevice?'block':'none';
  if(catRow)catRow.style.display=isDevice?'none':'flex';
  if(assetRow)assetRow.style.display=isDevice?'none':'flex';
  if(assetNote)assetNote.style.display=isDevice?'none':'block';
  expDedPctPreview();
  if(isDevice)expDeviceHint();
}
function expDeviceHint(){
  const el=$('#expDeviceHint');if(!el)return;
  const cap=FY().rates.deviceImmediateCap,c=num($('#f_a').value),wu=num($('#f_wu').value)||100,mth=$('#f_wm')?.value;
  const workAmt=c*wu/100;
  if(mth==='immediate'&&workAmt>cap)el.innerHTML=`⚠️ The work-related portion (${fmt$(workAmt)}) is more than ${fmt$0(cap)} — the ATO generally requires depreciation instead of an immediate claim. Switch to a decline-in-value method.`;
  else if(mth==='immediate')el.innerHTML=`Work-related portion ≤ ${fmt$0(cap)} can be claimed in full this year.`;
  else el.innerHTML=mth==='diminishing'?'Diminishing value: 200% ÷ effective life applied to the written-down value each year — bigger deductions up front.':'Prime cost: an equal slice of the cost each year over the effective life.';
}
function expDedPctPreview(){
  const el=$('#expDedPctHint');if(!el)return;
  if($('#f_dmode').value!=='percent'){el.textContent='';return;}
  const amt=num($('#f_a').value),pct=num($('#f_dpct').value);
  el.innerHTML=amt&&pct?`= ${fmt$(amt*pct/100)} claimable per period`:'';
}
function expRecChange(v){
  const show=v==='once'||v==='yearly';
  const row=$('#expDateRow');if(row)row.style.display=show?'flex':'none';
  expCalc();
}
function expCalc(){
  const el=$('#expCalcHint');if(!el)return;
  const a=num($('#f_a').value),rec=$('#f_rec').value;
  if(!a){el.innerHTML='';return;}
  const yearly=yearlyFromRec(a,rec);
  el.innerHTML=`Yearly: <b>${fmt$(yearly)}</b> · Monthly avg: <b>${fmt$(yearly/12)}</b>`;
}
/* Effective per-period deductible amount for a household expense row,
   honouring percentage mode (computed live off the current amount, so
   editing the amount keeps the deductible portion in sync automatically). */
function expDeductibleAmt(e){
  if(!e.isDeductible)return 0;
  // Work-device expenses don't contribute a deduction directly — the linked
  // Device record's own depreciation schedule (immediate write-off or
  // decline in value across FYs) is the sole source of that deduction.
  // Counting both here AND via the device would double-claim it.
  if(e.isWorkDevice)return 0;
  // Use percentage if: mode is explicitly 'percent', OR pct is set but fixed amount is 0
  // (handles legacy entries saved before deductibleMode was introduced)
  if(e.deductibleMode==='percent'||(num(e.deductiblePct)>0&&!num(e.deductibleAmount)))
    return num(e.amount)*num(e.deductiblePct)/100;
  return num(e.deductibleAmount)||0;
}
function expSave(i){
  const B=PD();B.expenses=B.expenses||[];
  const dedMode=$('#f_dmode')?.value||'fixed';
  const isWorkDevice=$('#f_ded').checked&&dedMode==='device';
  const e={
    id:i!=null?B.expenses[i].id:uid(),
    name:$('#f_n').value.trim()||'Expense',
    category:$('#f_cat').value,
    amount:num($('#f_a').value),
    recurrence:$('#f_rec').value||'monthly',
    schedDay:$('#f_dm').value||'',
    date:$('#f_dt')?$('#f_dt').value:'',
    isDeductible:$('#f_ded').checked,
    deductibleMode:dedMode,
    deductibleAmount:$('#f_ded').checked&&dedMode==='fixed'?num($('#f_da').value)||0:0,
    deductiblePct:$('#f_ded').checked&&dedMode==='percent'?num($('#f_dpct').value)||0:0,
    dedItem:$('#f_ditem')?$('#f_ditem').value||'':'',
    propCategory:$('#f_ded').checked&&!isWorkDevice?$('#f_dcat').value:'',
    assetId:$('#f_ded').checked&&!isWorkDevice&&$('#f_dasset')?$('#f_dasset').value:'',
    isWorkDevice,
    deviceWorkUse:isWorkDevice?(num($('#f_wu').value)||100):(i!=null?B.expenses[i].deviceWorkUse:undefined),
    deviceMethod:isWorkDevice?($('#f_wm').value||'immediate'):(i!=null?B.expenses[i].deviceMethod:undefined),
    deviceLife:isWorkDevice?(num($('#f_wl').value)||3):(i!=null?B.expenses[i].deviceLife:undefined),
    linkedDeviceId:i!=null?B.expenses[i].linkedDeviceId:undefined,
  };
  if(i!=null)B.expenses[i]=e;else B.expenses.push(e);
  // Sync the linked property expense entry.
  const dedAmt=expDeductibleAmt(e);
  if(e.isDeductible&&!isWorkDevice&&e.assetId&&dedAmt){
    expSyncPropExpense(e, B);
  }else if(i!=null){
    // Expense was edited and is no longer deductible or no longer has an asset
    // link — remove any stale linked property expense so it doesn't ghost.
    const staleIdx=B.property.expenses.findIndex(pe=>pe.expenseId===e.id);
    if(staleIdx>=0)B.property.expenses.splice(staleIdx,1);
  }
  // Sync the linked work-device record — create/update if device mode is
  // selected, or remove a stale one if the user switched away from it.
  if(isWorkDevice)expSyncDevice(e);
  else if(e.linkedDeviceId){
    expRemoveLinkedDevice(e);
    e.linkedDeviceId=undefined;
  }
  save();closeModal();render();toast('Expense saved');
}
/* Creates or updates a Device record linked to a work-device expense. Filed
   under whichever FY's date range actually contains the expense's date
   (same logic devSave uses), so editing the expense date later re-files
   the device correctly rather than leaving it stuck in the original FY. */
function expSyncDevice(e){
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const date=e.date||todayISO();
  const targetY=yearContainingDate(date)||FY();
  const fields={name:e.name,date,cost:num(e.amount),workUse:num(e.deviceWorkUse)||100,method:e.deviceMethod||'immediate',life:num(e.deviceLife)||3,linkedExpenseId:e.id};
  // Search every FY/person bucket for an existing linked device (it may
  // need to move buckets if the expense date changed FY since last save).
  let found=null,foundB=null,foundIdx=-1;
  Object.values(DB.years).forEach(fy=>{
    Object.values(fy.people||{}).forEach(b=>{
      const idx=(b.devices||[]).findIndex(d=>d.id===e.linkedDeviceId);
      if(idx>=0){found=b.devices[idx];foundB=b;foundIdx=idx;}
    });
  });
  if(found){
    Object.assign(found,fields);
    if(foundB!==bucket(targetY,pid)){
      // Date moved to a different FY — relocate the record
      foundB.devices.splice(foundIdx,1);
      bucket(targetY,pid).devices.push(found);
    }
  }else{
    const newDevice={id:uid(),...fields};
    bucket(targetY,pid).devices.push(newDevice);
    e.linkedDeviceId=newDevice.id;
  }
}
function expRemoveLinkedDevice(e){
  Object.values(DB.years).forEach(fy=>{
    Object.values(fy.people||{}).forEach(b=>{
      b.devices=(b.devices||[]).filter(d=>d.id!==e.linkedDeviceId);
    });
  });
}
function expSyncPropExpense(exp, B){
  // Create/update a matching property expense entry: `amount` is the FULL
  // cash repayment (for cashflow purposes), `deductibleAmount` is just the
  // claimable portion (e.g. interest, for tax purposes).
  const fullYearly=yearlyFromRec(exp.amount,exp.recurrence);
  const dedYearly=yearlyFromRec(expDeductibleAmt(exp),exp.recurrence);
  // Look for an existing linked property expense
  let propE=B.property.expenses.find(pe=>pe.expenseId===exp.id);
  if(!propE){
    propE={id:uid(),expenseId:exp.id,date:exp.date||todayISO(),category:exp.propCategory||'Interest',item:exp.name,amount:fullYearly,deductibleAmount:dedYearly};
    B.property.expenses.push(propE);
  }else{
    propE.amount=fullYearly;propE.deductibleAmount=dedYearly;propE.category=exp.propCategory||propE.category;propE.item=exp.name;
  }
}

/* fix: ensure car travel type is in the list */
if(!ATO_DEDUCTION_TYPES.includes('Car travel — cents per km'))
  ATO_DEDUCTION_TYPES.splice(ATO_DEDUCTION_TYPES.indexOf('Car expenses'),1,'Car travel — cents per km','Car expenses (logbook)');

/* ================= WFH TRACKER ================= */
function wfhTotals(y,b){
  b=b||PD();
  const days=Object.values(b.wfh.days).filter(v=>v==='wfh').length;
  const hpd=b.wfh.hoursPerDay||y.rates.wfh.hoursPerDay;
  const claim=days*hpd*y.rates.wfh.ratePerHour;
  return{days,hpd,claim};
}
PAGES.wfh=m=>{
  const y=FY(),B=PD();
  const hol={};fyHolidays(y).forEach(h=>hol[h.date]=h.name);
  const t=wfhTotals(y,B);
  const pp=person(DB.currentPid);const pCol=(pp&&pp.wfhColors)||{};
  const wfhCol=pCol.wfh||'#2563B8'; const awayCol=pCol.away||'#7A6FB3';
  m.style.setProperty('--wfh-user',wfhCol); m.style.setProperty('--away-user',awayCol);
  head(m,'WFH tracker',`Click a weekday to cycle: <b>office → WFH → away</b>. Or turn on <b>range select</b> and click a start day then an end day to set a whole stretch at once.`,
    `<button class="btn small ${WFH_RANGE_MODE?'primary':''}" onclick="wfhRangeModeToggle()">${WFH_RANGE_MODE?(WFH_RANGE_START?'Click an end day…':'📌 Range select — click a start day'):'📌 Range select'}</button>
     <button class="btn small" onclick="wfhBulk()">⇲ Set a date range</button>
     <button class="btn small" ${HOLIDAY_REFRESHING?'disabled':''} onclick="refreshHolidays(FY())" title="Re-check public holidays against data.vic.gov.au">${HOLIDAY_REFRESHING?'<span class="spinner"></span> Checking…':'↻ Check holidays online'}</button>`);
  m.insertAdjacentHTML('beforeend',`
  <div class="grid3">
    <div class="stat"><div class="l">Total WFH days</div><div class="v">${t.days}</div></div>
    <div class="stat"><div class="l">Hours / day × rate</div><div class="v">${t.hpd} × ${(y.rates.wfh.ratePerHour*100).toFixed(0)}c</div>
      <div class="d"><button class="btn small" onclick="wfhHours()">Change hours/day</button></div></div>
    <div class="stat gold"><div class="l">Total claimable</div><div class="v">${fmt$(t.claim)}</div><div class="d">fixed-rate method (${esc(y.label)})</div></div>
  </div>
  <div class="cal-legend">
    <span><span class="sw" style="background:${wfhCol}"></span>WFH</span>
    <span><span class="sw" style="background:var(--surface);border:1px solid var(--line2)"></span>Office</span>
    <span><span class="sw" style="background:${awayCol}"></span>Away / leave</span>
    <span><span class="sw" style="background:var(--grey-cell)"></span>Public holiday</span>
    <span><span class="sw" style="background:var(--orange-soft);border-color:var(--orange)"></span>Weekend</span>
  </div>
  <div class="card"><div class="cbody">${HOLIDAY_REFRESHING?'<div class="hint" style="margin-bottom:10px"><span class="spinner"></span> Checking public holidays online — the calendar below will refresh once that\'s done.</div>':''}<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 26px" id="calwrap" class="${HOLIDAY_REFRESHING?'skel-pulse':''}"></div></div></div>`);
  const wrap=$('#calwrap');
  // Months shown are derived from the FY's actual date range (fyRange),
  // not y.startYear directly — y.startYear is just the storage slot, but a
  // custom-dated FY (via Settings → Edit financial year) can represent a
  // completely different calendar range, and the public holidays (from
  // fyHolidays, which already uses fyRange) need to land on the months
  // actually shown here.
  const months=[];for(let k=0;k<12;k++){const{yr,mo}=fyMonthYM(y,k);months.push([yr,mo]);}
  const dows=['Su','Mo','Tu','We','Th','Fr','Sa'];
  months.forEach(([yr,mo])=>{
    const first=new Date(Date.UTC(yr,mo,1));
    const dim=new Date(Date.UTC(yr,mo+1,0)).getUTCDate();
    let cells=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
    for(let b=0;b<first.getUTCDay();b++)cells+='<div class="cal-day empty"></div>';
    let cnt=0;
    for(let d=1;d<=dim;d++){
      const ds=`${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dow=new Date(ds+'T00:00:00Z').getUTCDay();
      let cls='',tip='';
      if(dow===0||dow===6)cls='weekend';
      else if(hol[ds]){cls='holiday';tip=hol[ds];}
      else{const st=B.wfh.days[ds];if(st==='wfh'){cls='wfh';cnt++;}else if(st==='away'){cls='away';tip='Away / leave';}}
      if(WFH_RANGE_START===ds)cls+=' range-pending';
      cells+=`<div class="cal-day ${cls}" ${cls.includes('weekend')||cls.includes('holiday')?'':`onclick="wfhDayClick('${ds}')"`} title="${esc(tip)}">${d}</div>`;
    }
    const name=first.toLocaleString('en-AU',{month:'long',timeZone:'UTC'});
    wrap.insertAdjacentHTML('beforeend',`<div class="cal-month"><div class="cal-mname">${name} ${yr} <span class="muted" style="font-weight:400;font-size:.78rem">· ${cnt} WFH</span></div><div class="cal-grid">${cells}</div></div>`);
  });
  const wh=y.webHolidays;
  m.insertAdjacentHTML('beforeend',`<div class="note">Holidays ${wh?`were last checked online on ${fmtDate(wh.fetchedAt)} (${esc(wh.source)})`:`use the built-in Victorian calendar (incl. an estimated AFL Grand Final eve)`}. Use <b>↻ Check holidays online</b> above to refresh from data.vic.gov.au, or add/remove dates in <a href="#" onclick="go('settings');return false">Settings</a>.</div>`);
};
function wfhBulk(){
  if(lockedGuard())return;
  const y=FY();
  modal('Set a date range',`
    <div class="fldrow"><div><label class="fld">From</label><input id="f_a" type="date" class="input"></div>
    <div><label class="fld">To (inclusive)</label><input id="f_b" type="date" class="input"></div>
    <div><label class="fld">Mark as</label><select id="f_s" class="input">
      <option value="wfh">WFH</option><option value="away">Away / leave</option><option value="">Office (clear)</option></select></div></div>
    <div class="note">Only weekdays inside ${esc(y.label)} are touched — weekends and public holidays are skipped automatically. Great for blocking out annual leave or a WFH stretch in one go.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="wfhBulkApply()">Apply</button>`);
}
function wfhBulkApply(){
  const y=FY(),B=PD();
  let a=$('#f_a').value,b=$('#f_b').value;const st=$('#f_s').value;
  if(!a||!b)return toast('Pick both dates');
  if(a>b)[a,b]=[b,a];
  const {start,end}=fyRange(y);
  if(a<start)a=start; if(b>end)b=end;
  const hol={};fyHolidays(y).forEach(h=>hol[h.date]=1);
  let n=0;
  const d=new Date(a+'T00:00:00Z'),fin=new Date(b+'T00:00:00Z');
  while(d<=fin){
    const ds=iso(d),dow=d.getUTCDay();
    if(dow!==0&&dow!==6&&!hol[ds]){
      if(st)B.wfh.days[ds]=st;else delete B.wfh.days[ds];
      n++;
    }
    d.setUTCDate(d.getUTCDate()+1);
  }
  save();closeModal();render();
  toast(`${n} weekday${n===1?'':'s'} ${st?'set to '+(st==='wfh'?'WFH':'away'):'cleared'}`);
}
let WFH_RANGE_MODE=false, WFH_RANGE_START=null; // transient UI state, not synced to Drive
function wfhRangeModeToggle(){
  WFH_RANGE_MODE=!WFH_RANGE_MODE;
  WFH_RANGE_START=null;
  render();
}
function wfhDayClick(ds){
  if(lockedGuard())return;
  if(!WFH_RANGE_MODE){wfhCycle(ds);return;}
  if(!WFH_RANGE_START){WFH_RANGE_START=ds;render();return;}
  let a=WFH_RANGE_START,b=ds;
  if(a>b)[a,b]=[b,a];
  WFH_RANGE_START=null;
  wfhRangeTypePrompt(a,b);
}
function wfhRangeTypePrompt(a,b){
  const sameDay=a===b;
  modal(sameDay?`Mark ${fmtDate(a)} as…`:`Mark ${fmtDate(a)} – ${fmtDate(b)} as…`,`
    <div class="fldrow"><div><label class="fld">Mark as</label><select id="f_rs" class="input">
      <option value="wfh">WFH</option><option value="away">Away / leave</option><option value="">Office (clear)</option></select></div></div>
    <div class="note">${sameDay?'':'Every weekday in this range, '}weekends and public holidays are skipped automatically.</div>`,
    `<button class="btn" data-close onclick="WFH_RANGE_MODE=false;render()">Cancel</button><button class="btn primary" onclick="wfhRangeApply('${a}','${b}')">Apply</button>`);
}
function wfhRangeApply(a,b){
  const y=FY(),B=PD();
  const st=$('#f_rs').value;
  const {start,end}=fyRange(y);
  if(a<start)a=start; if(b>end)b=end;
  const hol={};fyHolidays(y).forEach(h=>hol[h.date]=1);
  let n=0;
  const d=new Date(a+'T00:00:00Z'),fin=new Date(b+'T00:00:00Z');
  while(d<=fin){
    const ds=iso(d),dow=d.getUTCDay();
    if(dow!==0&&dow!==6&&!hol[ds]){
      if(st)B.wfh.days[ds]=st;else delete B.wfh.days[ds];
      n++;
    }
    d.setUTCDate(d.getUTCDate()+1);
  }
  WFH_RANGE_MODE=false;
  save();closeModal();render();
  toast(`${n} weekday${n===1?'':'s'} ${st?'set to '+(st==='wfh'?'WFH':'away'):'cleared'}`);
}
function wfhCycle(ds){
  if(lockedGuard())return;
  const D=PD().wfh.days,cur=D[ds];
  if(!cur)D[ds]='wfh';else if(cur==='wfh')D[ds]='away';else delete D[ds];
  save();render();
}
function wfhHours(){
  if(lockedGuard())return;
  const y=FY(),B=PD();
  const v=prompt('Average hours worked per WFH day:',B.wfh.hoursPerDay||y.rates.wfh.hoursPerDay);
  if(v!=null){B.wfh.hoursPerDay=num(v)||y.rates.wfh.hoursPerDay;save();render();}
}

/* ================= RECEIPT STORE ================= */
/* Receipts can be stored in:
   A) IndexedDB (default, local — included in backup)
   B) Google Drive (cloud — only metadata in backup; file lives in Drive)
   The receipt record stored in DB.rcptMeta[id] = {id, name, type, store:'gdrive', driveId}
   IDB records keep the blob directly as before.  */

/* ---- A) IndexedDB (legacy + fallback) ---- */
let _idb=null;
function idb(){return new Promise((res,rej)=>{if(_idb)return res(_idb);
  const q=indexedDB.open('ledger-receipts',1);
  q.onupgradeneeded=()=>q.result.createObjectStore('receipts',{keyPath:'id'});
  q.onsuccess=()=>{_idb=q.result;res(_idb);};q.onerror=()=>rej(q.error);});}
function idbPut(rec){return idb().then(d=>new Promise((res,rej)=>{const t=d.transaction('receipts','readwrite');t.objectStore('receipts').put(rec);t.oncomplete=res;t.onerror=()=>rej(t.error);}));}
function idbGet(id){return idb().then(d=>new Promise((res,rej)=>{const r=d.transaction('receipts').objectStore('receipts').get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}));}
function idbDel(id){return idb().then(d=>new Promise((res,rej)=>{const t=d.transaction('receipts','readwrite');t.objectStore('receipts').delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error);}));}

/* ---- B) Google Drive ---- */
const GD={
  SCOPES:'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
  BASE:'https://www.googleapis.com/drive/v3',
  UPLOAD:'https://www.googleapis.com/upload/drive/v3',
  get cfg(){return DB.gdrive=DB.gdrive||{clientId:'',token:'',tokenExpiry:0,userEmail:'',userName:''};},
  get token(){const c=this.cfg;return c.tokenExpiry>Date.now()?c.token:'';},
  set token(t){this.cfg.token=t.access_token;this.cfg.tokenExpiry=Date.now()+((t.expires_in||3600)-60)*1000;save();},
  isConnected(){return !!(this.token&&this.cfg.clientId);},
  // Load GIS library on demand
  async loadGIS(){
    if(window.google?.accounts?.oauth2)return;
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://accounts.google.com/gsi/client';
      s.onload=res;
      // onerror passes an Event not an Error — wrap it so .message is always a string
      s.onerror=()=>rej(new Error('Could not load Google Identity Services — check your internet connection and that accounts.google.com is not blocked'));
      document.head.appendChild(s);
    });
  },
  // Trigger OAuth popup (token client / implicit flow)
  async connect(){
    // Use hardcoded Client ID if configured, else fall back to stored one
    if(OAUTH_CLIENT_ID)this.cfg.clientId=OAUTH_CLIENT_ID;
    if(!this.cfg.clientId)throw new Error('No Client ID configured — set OAUTH_CLIENT_ID in the app file');
    if(typeof window!=='undefined'&&window.location?.protocol==='file:')
      throw new Error('Google OAuth requires http:// — run: python -m http.server 8000  then open http://localhost:8000');
    await this.loadGIS();
    return new Promise((res,rej)=>{
      let settled=false;
      const finish=(fn,val)=>{if(settled)return;settled=true;cleanup();fn(val);};
      const c=google.accounts.oauth2.initTokenClient({
        client_id:this.cfg.clientId,
        scope:this.SCOPES,
        callback:async t=>{
          if(t.error){finish(rej,new Error(t.error_description||t.error||'Google returned an auth error'));return;}
          GD.token=t;
          // Fetch user info to store name/email for display purposes only.
          // Access is controlled entirely by Google Console — no client-side email check.
          try{
            const r=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{'Authorization':'Bearer '+t.access_token}});
            if(r.ok){
              const info=await r.json();
              GD.cfg.userEmail=info.email||'';
              GD.cfg.userName=info.given_name||info.name||'';
              if(typeof save==='function')save();
            }
          }catch(_){}
          finish(res,t);
        },
        // error_callback receives a plain object not an Error — extract message safely
        error_callback:e=>{
          const msg=e?.type||e?.message||(typeof e==='string'?e:null)||'Auth cancelled or popup blocked';
          finish(rej,new Error(msg));
        }
      });
      // On some mobile browsers, the sign-in opens in a new TAB (not a true
      // popup). If the user is already signed into Google it auto-approves
      // and the tab closes itself — but the GIS callback can fail to fire
      // because the tab/opener message channel doesn't connect reliably.
      // Detect "focus returned to this tab but nothing happened" and fail
      // gracefully so the button re-enables instead of hanging forever.
      const onFocus=()=>{
        setTimeout(()=>{
          finish(rej,new Error('Sign-in window closed without completing — this can happen on some mobile browsers. Please try again (or try a different browser if it keeps happening).'));
        },1500);
      };
      function cleanup(){
        window.removeEventListener('focus',onFocus);
        clearTimeout(hardTimeout);
      }
      window.addEventListener('focus',onFocus,{once:true});
      const hardTimeout=setTimeout(()=>{
        finish(rej,new Error('Sign-in timed out — please try again.'));
      },30000);
      c.requestAccessToken({prompt:''});
    });
  },
  /* Folder hierarchy:
     Ledger/
     ├── FY25-26/
     │   ├── Investment Property/
     │   │   └── 2025-08-01 Loan interest.pdf
     │   ├── Other Deductions/
     │   │   └── 2026-03-15 Tax prep fee.pdf
     │   └── Expenses/
     │       └── 2026-01-01 Mortgage repayment.pdf
     └── FY24-25/ … */
  async ensureFolderPath(parts){
    // parts = ['Applications','Ledger','FY25-26','Investment Property']
    // Returns the deepest folder's Drive ID; caches all levels
    const cache=this.cfg.folders=this.cfg.folders||{};
    let parentId=null; // null = Drive root ('root')
    let pathKey='';
    for(const name of parts){
      pathKey=pathKey?`${pathKey}/${name}`:name;
      if(cache[pathKey]){parentId=cache[pathKey];continue;}
      // Search for existing folder
      const parentClause=parentId?`'${parentId}' in parents`:"'root' in parents";
      const q=encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and ${parentClause} and trashed=false`);
      const r=await this.api('GET',`/files?q=${q}&fields=files(id,name)`);
      if(r.files?.length){parentId=r.files[0].id;}
      else{
        const body={name,mimeType:'application/vnd.google-apps.folder'};
        if(parentId)body.parents=[parentId];
        const f=await this.api('POST','/files',body);
        parentId=f.id;
      }
      cache[pathKey]=parentId;
      save();
    }
    return parentId;
  },
  async api(method,path,body,uploadBlob,mime,folderId){
    if(!this.token){await this.connect();}
    const hdrs={'Authorization':'Bearer '+this.token};
    let res;
    if(uploadBlob){
      // Multipart upload with explicit folderId
      const meta=JSON.stringify({name:body.name,parents:folderId?[folderId]:[]});
      const boundary='-------ledger'+Date.now();
      const bArr=await uploadBlob.arrayBuffer();
      const parts=[
        `--${boundary}
Content-Type: application/json; charset=UTF-8

${meta}
`,
        `--${boundary}
Content-Type: ${mime}

`,
        bArr,
        `
--${boundary}--`
      ];
      const chunks=[];
      for(const p of parts)chunks.push(typeof p==='string'?new TextEncoder().encode(p):new Uint8Array(p));
      const total=chunks.reduce((s,c)=>s+c.length,0);
      const combined=new Uint8Array(total);let off=0;
      for(const c of chunks){combined.set(c,off);off+=c.length;}
      hdrs['Content-Type']=`multipart/related; boundary=${boundary}`;
      res=await fetch(this.UPLOAD+path+'?uploadType=multipart&fields=id,name,mimeType,size',{method:'POST',headers:hdrs,body:combined});
    }else{
      if(body)hdrs['Content-Type']='application/json';
      res=await fetch(this.BASE+path,{method,headers:hdrs,body:body?JSON.stringify(body):undefined});
    }
    if(res.status===401){GD.cfg.token='';GD.cfg.tokenExpiry=0;if(typeof save==='function')save();throw new Error('Auth expired — reconnect Drive');}
    if(!res.ok&&res.status!==204)throw new Error('Drive API error '+res.status);
    if(res.status===204||method==='DELETE')return null;
    return res.json();
  },
  async upload(file,folderId){
    return this.api('POST','/files',{name:file.name},file,file.type,folderId);
  },
  async download(driveId){
    if(!this.token){await this.connect();}
    const res=await fetch(this.BASE+`/files/${driveId}?alt=media`,{headers:{'Authorization':'Bearer '+this.token}});
    if(!res.ok)throw new Error('Drive download failed '+res.status);
    return res.blob();
  },
  async deleteFile(driveId){
    return this.api('DELETE',`/files/${driveId}`);
  },
  /* ---- JSON data file (data.json in Ledger/ folder by default) ---- */
  async writeJSON(name,content,folderParts){
    const folderId=await this.ensureFolderPath(folderParts||['Applications','Ledger']);
    const q=encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
    const r=await this.api('GET',`/files?q=${q}&fields=files(id)`);
    const fileId=r.files?.[0]?.id;
    const blob=new Blob([content],{type:'application/json'});
    if(fileId){
      // Update existing file content only (no metadata change)
      const hdrs={'Authorization':'Bearer '+this.token,'Content-Type':'application/json'};
      const res=await fetch(this.UPLOAD+`/files/${fileId}?uploadType=media&fields=id`,
        {method:'PATCH',headers:hdrs,body:blob});
      if(!res.ok)throw new Error('Drive data update failed '+res.status);
      return res.json();
    }
    return this.upload(new File([blob],name,{type:'application/json'}),folderId);
  },
  async readJSON(name,folderParts){
    const folderId=await this.ensureFolderPath(folderParts||['Applications','Ledger']);
    const q=encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
    const r=await this.api('GET',`/files?q=${q}&fields=files(id)`);
    const fileId=r.files?.[0]?.id;
    if(!fileId)return null;
    const blob=await this.download(fileId);
    return blob.text();
  },
  /* Lists files (name + id, sorted by name desc) directly inside a folder path. */
  async listFiles(folderParts){
    const folderId=await this.ensureFolderPath(folderParts||['Applications','Ledger']);
    const q=encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const r=await this.api('GET',`/files?q=${q}&fields=files(id,name)&orderBy=name desc&pageSize=1000`);
    return r.files||[];
  }

};

/* ---- Unified rcpt API ---- */
function sanitizeFN(s){return String(s||'').replace(/[/\\:*?"<>|]/g,'-').replace(/\s+/g,' ').trim().slice(0,80);}
async function rcptPut(rec,ctx){
  // rec = {id, name, type, blob}
  // ctx = {fy:string, category:string, date:string, itemName:string, pid:string}  (optional)
  if(GD.isConnected()||DB.gdrive?.clientId){
    try{
      if(!GD.isConnected())await GD.connect();
      // Build folder path: Ledger / FY25-26 / <Person> / Investment Property
      // The per-person level only appears once there's more than one
      // person, so single-person households keep the simpler existing
      // structure (no unnecessary nesting / no migration needed for them).
      const folderParts=['Applications','Ledger'];
      if(ctx?.fy)folderParts.push(ctx.fy);
      if(ctx?.pid&&DB.people.length>1){const pp=person(ctx.pid);if(pp)folderParts.push(sanitizeFN(pp.name));}
      if(ctx?.category)folderParts.push(sanitizeFN(ctx.category));
      const folderId=await GD.ensureFolderPath(folderParts);
      // Build a meaningful filename: 2025-08-01 Loan interest.pdf
      const ext=rec.name.split('.').pop()||'file';
      const dateStr=ctx?.date||todayISO();
      const itemStr=ctx?.itemName?sanitizeFN(ctx.itemName):rec.name.replace(/\.[^.]+$/,'');
      const driveName=`${dateStr} ${itemStr}.${ext}`.slice(0,200);
      const file=new File([rec.blob],driveName,{type:rec.type});
      const uploaded=await GD.upload(file,folderId);
      DB.rcptMeta=DB.rcptMeta||{};
      DB.rcptMeta[rec.id]={id:rec.id,name:rec.name,type:rec.type,store:'gdrive',driveId:uploaded.id,
        drivePath:folderParts.join('/')+'/'+driveName};
      // Delete any local IDB copy — Drive is the source of truth now
      idbDel(rec.id).catch(()=>{});
      save();return;
    }catch(e){toast('Drive upload failed — saving locally: '+e.message);}
  }
  await idbPut(rec);
}
async function rcptGet(id){
  const meta=(DB.rcptMeta||{})[id];
  if(meta?.store==='gdrive'){
    try{
      const blob=await GD.download(meta.driveId);
      return{id,name:meta.name,type:meta.type,blob};
    }catch(e){toast('Could not load from Drive: '+e.message);return null;}
  }
  return idbGet(id);
}
async function rcptDel(id){
  const meta=(DB.rcptMeta||{})[id];
  if(meta?.store==='gdrive'){
    try{await GD.deleteFile(meta.driveId);}catch(e){}
    delete DB.rcptMeta[id];save();return;
  }
  return idbDel(id);
}

/* ---- Bulk receipt cleanup ---- */
/* Collects every receiptId from property expenses + other deductions across
   all financial years, optionally filtered to a specific year and/or person.
   Used when deleting an FY or a person, so their Drive files / local IDB
   blobs don't become orphaned. */
function collectReceiptIds({fyKey,pid}={}){
  const ids=[];
  Object.entries(DB.years).forEach(([k,y])=>{
    if(fyKey!=null&&k!==String(fyKey))return;
    DB.people.forEach(p=>{
      if(pid!=null&&p.id!==pid)return;
      const b=(y.people||{})[p.id];
      if(!b)return;
      (b.property?.expenses||[]).forEach(e=>{if(e.receiptId)ids.push(e.receiptId);});
      (b.other||[]).forEach(e=>{if(e.receiptId)ids.push(e.receiptId);});
      (b.dividends||[]).forEach(d=>{if(d.receiptId)ids.push(d.receiptId);});
      (b.funds||[]).forEach(f=>{if(f.receiptId)ids.push(f.receiptId);});
      (b.incomes||[]).forEach(r=>{if(r.receiptId)ids.push(r.receiptId);});
      if(b.myTax?.receiptId)ids.push(b.myTax.receiptId);
      if(b.fbt?.receiptId)ids.push(b.fbt.receiptId);
    });
  });
  // NW entries (balance statements — not FY/person scoped, stored globally)
  if(fyKey==null&&pid==null){
    (DB.nw?.entries||[]).forEach(e=>{if(e.receiptId)ids.push(e.receiptId);});
    // Property asset annual statements (FY-keyed)
    (DB.assets||[]).forEach(a=>{
      Object.values(a.annualStatements||{}).forEach(s=>{if(s?.id)ids.push(s.id);});
      // Legacy single statement field (migrated entries)
      if(a.annualStatementId)ids.push(a.annualStatementId);
    });
  }
  return ids;
}
/* Whether a receipt is still referenced by anything ANYWHERE in the data
   (across every year and person), so a delete in one spot doesn't yank a
   statement still needed by another dividend/fund/expense sharing the same
   upload (e.g. a CSV/PDF import batch, or a statement covering several
   payments). Used before every receipt deletion. */
function receiptStillReferenced(receiptId){
  if(!receiptId)return false;
  return collectReceiptIds().includes(receiptId);
}
/* Prune DB.rcptMeta of any ids no longer referenced by any record.
   Called after person/FY deletion as a safety net. Does not touch Drive
   (the records themselves were already cleaned by deleteReceiptIds). */
function pruneOrphanRcptMeta(){
  if(!DB.rcptMeta)return;
  const live=new Set(collectReceiptIds());
  Object.keys(DB.rcptMeta).forEach(id=>{if(!live.has(id))delete DB.rcptMeta[id];});
}
async function deleteReceiptIds(ids){
  for(const id of ids){await rcptDel(id).catch(()=>{});}
}
/* Deletes a whole Drive folder (and everything inside it) by cached path key,
   e.g. 'Ledger/FY25-26'. Removes the folder + any cached child-folder IDs from
   GD.cfg.folders so a future upload re-creates a clean folder rather than
   reusing the trashed one's ID. */
async function deleteDriveFolderByPath(pathKey){
  const folders=GD.cfg.folders||{};
  const folderId=folders[pathKey];
  if(folderId&&GD.isConnected()){
    try{await GD.deleteFile(folderId);}catch(e){}
  }
  Object.keys(folders).forEach(k=>{if(k===pathKey||k.startsWith(pathKey+'/'))delete folders[k];});
  save();
}
async function rcptView(id,name){
  const rec=await rcptGet(id);
  if(!rec)return toast('Receipt not found in this browser');
  try{
    const mime=rec.type||'application/octet-stream';
    const blob=rec.blob instanceof Blob
      ?(rec.blob.type?rec.blob:new Blob([rec.blob],{type:mime}))
      :new Blob([rec.blob||''],{type:mime});
    const isImg=mime.startsWith('image/');
    const isPdf=mime.includes('pdf');
    // Use FileReader → data URL so it works from file:// and in all browser contexts
    // (blob:// URLs in iframes and img tags are blocked in many file:// / sandboxed contexts)
    const dataUrl=await new Promise((res,rej)=>{
      const fr=new FileReader();
      fr.onload=()=>res(fr.result);
      fr.onerror=()=>rej(new Error('Could not read file'));
      fr.readAsDataURL(blob);
    });
    let body;
    if(isImg){
      body=`<div style="text-align:center;background:var(--surface2);border-radius:8px;padding:6px">
        <img src="${dataUrl}" style="max-width:100%;max-height:500px;border-radius:6px;display:block;margin:0 auto">
      </div>`;
    }else if(isPdf){
      body=`<div style="text-align:center;padding:28px 0;color:var(--muted)">
        <div style="font-size:2.5rem;margin-bottom:10px">📄</div>
        <div style="font-weight:700;color:var(--ink)">${esc(rec.name||'document.pdf')}</div>
        <div style="font-size:.84rem;margin-top:6px">PDF — use <b>Open in new tab</b> to view inline, or <b>Download</b> to save.</div>
      </div>`;
    }else{
      body=`<div style="text-align:center;padding:24px;color:var(--muted)">
        <div style="font-size:2rem;margin-bottom:8px">📎</div>
        <div style="font-weight:600;color:var(--ink)">${esc(rec.name||'file')}</div>
        <div style="font-size:.84rem;margin-top:4px">${mime}</div>
      </div>`;
    }
    // For download/open we still need a blob URL (only needed at click time)
    modal(name||'Receipt',body,
      `<button class="btn" onclick="(async()=>{const b=await rcptGet('${id}');if(!b)return;const blob=b.blob instanceof Blob?b.blob:new Blob([b.blob],{type:'${mime.replace(/'/g,'')}'}); const fr=new FileReader();fr.onload=()=>{const a=document.createElement('a');a.href=fr.result;a.download='${esc((rec.name||'receipt').replace(/'/g,""))}';a.click();};fr.readAsDataURL(blob);})()">Download</button>
       <button class="btn primary" onclick="(async()=>{const b=await rcptGet('${id}');if(!b)return;const blob=b.blob instanceof Blob?b.blob:new Blob([b.blob],{type:'${mime.replace(/'/g,'')}'}); const url=URL.createObjectURL(blob);const w=window.open(url,'_blank');if(!w){const a=document.createElement('a');a.href=url;a.target='_blank';document.body.appendChild(a);a.click();document.body.removeChild(a);}setTimeout(()=>URL.revokeObjectURL(url),10000);})()">Open in new tab</button>
       <button class="btn" data-close>Close</button>`);
  }catch(err){toast('Could not display receipt: '+err.message);}
}

/* ================= INVESTMENT PROPERTY HELPERS ================= */
/* Context set by the asset card so propAdd/propSave/propDelete work for any FY+person */
let PROP_CTX=null; // {fyKey:string, pid:string, assetId:string}
function propBucket(){
  if(PROP_CTX){const y=yearByOrderYear(num(PROP_CTX.fyKey));if(y)return bucket(y,PROP_CTX.pid);}
  return PD();
}
function propFY(){return PROP_CTX?(yearByOrderYear(num(PROP_CTX.fyKey))||FY()):FY();}
function propAsset(){return PROP_CTX?.assetId?DB.assets.find(x=>x.id===PROP_CTX.assetId):null;}
const PROP_CATS=['Interest','Mortgage Repayment','Rates','Insurance','Property management fees','Body corporate','Land tax','Water','Pest control','Repairs & maintenance','Depreciation','Bank fees','Advertising','Travel','Other'];
const VEHICLE_CATS=['Fuel','Insurance','Registration','Servicing & maintenance','Tyres','Loan interest','Lease payments','Other'];
function expenseCatsFor(asset){return asset&&asset.kind==='vehicle'?VEHICLE_CATS:PROP_CATS;}
// PAGES.property removed — property expenses now live in the Assets page
async function propDelete(i){
  const B=propBucket();
  const e=B.property.expenses[i];
  const rid=e.receiptId;
  B.property.expenses.splice(i,1);save();render();
  if(rid&&!receiptStillReferenced(rid))await rcptDel(rid).catch(()=>{});
}
function propAdd(i){
  const y=propFY();
  if(y.locked){toast(fyDisplay(y)+' is locked');return;}
  const B=propBucket(),asset=propAsset();
  const cats=expenseCatsFor(asset);
  const e=i!=null?B.property.expenses[i]:{date:todayISO(),category:cats[0],item:'',amount:''};
  const ded=i!=null?propExpDeductible(e):'';
  const isVehicle=asset&&asset.kind==='vehicle';
  const isPPOR=asset&&asset.kind==='property'&&asset.investment===false;
  modal(i!=null?'Edit expense':(isVehicle?'Add vehicle expense':'Add property expense'),`
    <div class="fldrow"><div><label class="fld">Date</label><input id="f_d" type="date" class="input" value="${e.date}"></div>
    <div><label class="fld">Category</label><select id="f_c" class="input">${cats.map(c=>`<option ${e.category===c?'selected':''}>${c}</option>`).join('')}</select></div></div>
    <div class="fldrow mt"><div style="flex:2"><label class="fld">Detail</label><input id="f_i" class="input" value="${esc(e.item)}" placeholder="${isVehicle?'e.g. Annual rego, comprehensive insurance':'e.g. Q2 council rates'}"></div>
    <div><label class="fld">Amount ($)</label><input id="f_a" class="input money" value="${e.amount}" oninput="propAmountChange()"></div></div>
    ${isPPOR?`<div class="hint">This is a home, not an investment property, so it isn't tax-deductible — tracked here for your own budgeting only.</div>`:`
    <div class="fldrow mt"><div><label class="fld">Tax-deductible amount ($)</label><input id="f_da" class="input money" value="${ded}" data-auto="${i==null||ded>=num(e.amount)?'true':'false'}" oninput="this.dataset.auto='false'"></div></div>
    <div class="hint">Defaults to the full amount (100% deductible) — most expenses like insurance, rates and repairs are fully deductible. For a mortgage repayment, enter the <b>full repayment</b> as Amount and only the <b>interest portion</b> here.${isVehicle?' For a vehicle, this is typically the work-use percentage of the cost (e.g. logbook %).':''}</div>`}
    <div class="mt"><label class="fld">Receipt ${e.receiptId?'(replaces existing)':''}</label><input id="f_r" type="file" class="input" accept="image/*,.pdf"></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="propSave(${i==null?'null':i})">Save</button>`);
}
/* When the user changes the full amount and the deductible field hasn't
   been manually diverged, keep it in sync (defaulting to "fully
   deductible") so most users never need to touch the second field. */
function propAmountChange(){
  const da=$('#f_da');
  if(da&&da.dataset.auto!=='false')da.value=$('#f_a').value;
}
async function propSave(i){
  const B=propBucket();
  const e=i!=null?{...B.property.expenses[i]}:{id:uid()};
  e.date=$('#f_d').value;e.category=$('#f_c').value;e.item=$('#f_i').value.trim();e.amount=num($('#f_a').value);
  const daField=$('#f_da');
  e.deductibleAmount=daField?(num(daField.value)||0):0;
  if(PROP_CTX?.assetId)e.assetId=PROP_CTX.assetId;
  const file=$('#f_r')?.files[0];
  if(file){e.receiptId=e.receiptId||uid();e.receiptName=file.name;}
  const ctx=PROP_CTX;PROP_CTX=null;
  if(i!=null)B.property.expenses[i]=e;else B.property.expenses.push(e);
  save();closeModal();render();toast('Expense saved');
  if(file){
    try{
      await rcptPut({id:e.receiptId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(propFY()),category:propAsset()?.kind==='vehicle'?'Vehicle Expenses':'Investment Property',date:e.date,itemName:e.item,pid:ctx?.pid||DB.currentPid});
      render();
    }catch(_){toast("Expense saved — couldn't attach the file, try re-attaching from the expense row");}
  }
}

/* ================= WORK DEVICES (depreciating assets) ================= */
/* Finds the FY object whose ACTUAL date range (respecting any custom
   rangeStart/rangeEnd override) contains the given date — robust to a
   year's startYear/dict-key drifting from its real dates after the user
   edits start/end dates via Settings → rename. Never assume a date's
   calendar year matches a dict key. */
function yearContainingDate(dateISO){
  return Object.values(DB.years).find(y=>{
    const r=fyRange(y);
    return dateISO>=r.start&&dateISO<=r.end;
  })||null;
}
function fyStartYearOf(dateISO){const[yy,mm]=dateISO.split('-').map(Number);return mm>=7?yy:yy-1;}
function deviceDeductionForFY(d,y){
  const cost=num(d.cost),wu=(num(d.workUse)||100)/100;
  if(!d.date||!cost)return 0;
  const purchaseY=yearContainingDate(d.date);
  if(!purchaseY)return 0; // the FY this device was bought in doesn't exist yet
  const purchaseOrder=fyOrderYear(purchaseY),yOrder=fyOrderYear(y);
  if(yOrder<purchaseOrder)return 0;
  if(d.method==='immediate')return yOrder===purchaseOrder?cost*wu:0;
  const life=num(d.life)||3;
  const purchase=new Date(d.date+'T00:00:00Z');
  // Walk chronologically through every FY that actually exists between the
  // purchase year and the target year, using each one's REAL date range
  // (not assumed July–June math), so custom FY date overrides are respected.
  const years=Object.values(DB.years).filter(yy=>fyOrderYear(yy)>=purchaseOrder&&fyOrderYear(yy)<=yOrder).sort((a,b)=>fyOrderYear(a)-fyOrderYear(b));
  let base=cost,totalClaimed=0;
  for(const fy of years){
    const r=fyRange(fy);
    const fyEnd=new Date(r.end+'T00:00:00Z'),fyStart=new Date(r.start+'T00:00:00Z');
    const daysInYear=Math.max(1,Math.round((fyEnd-fyStart)/86400000)+1);
    const isPurchaseYear=fyOrderYear(fy)===purchaseOrder;
    const days=isPurchaseYear?Math.max(1,Math.round((fyEnd-purchase)/86400000)+1):daysInYear;
    let dec;
    if(d.method==='diminishing')dec=base*Math.min(days/daysInYear,1)*(2/life);
    else dec=cost*Math.min(days/daysInYear,1)*(1/life);
    dec=Math.min(dec,d.method==='diminishing'?base:cost-totalClaimed);
    if(fyOrderYear(fy)===yOrder)return Math.max(0,dec)*wu;
    base-=dec;totalClaimed+=dec;
  }
  return 0;
}
function devDetail(devId, purchasedInLabel){
  // Find the device across all FY buckets
  let dev=null, purchaseFYKey=null;
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  Object.entries(DB.years).forEach(([k,fy])=>{
    const b=bucket(fy,pid);
    const d=b.devices.find(x=>x.id===devId);
    if(d){dev=d;purchaseFYKey=k;}
  });
  if(!dev)return toast('Device not found');
  const purchaseFY=DB.years[purchaseFYKey];
  const methodLabel=dev.method==='immediate'?'Immediate write-off':dev.method==='diminishing'?'Diminishing value':'Prime cost';
  const workAmt=dev.cost*(dev.workUse||100)/100;

  // Build per-FY claim schedule
  const fySchedule=Object.values(DB.years).sort((a,b)=>a.startYear-b.startYear).map(fy=>{
    const claim=deviceDeductionForFY(dev,fy);
    const wdv=dev.method!=='immediate'?(() => {
      // Compute written-down value at start of this FY
      let remaining=workAmt;
      Object.values(DB.years).sort((a,b)=>a.startYear-b.startYear).forEach(prevFy=>{
        if(prevFy.startYear>=fy.startYear)return;
        remaining-=deviceDeductionForFY(dev,prevFy);
      });
      return Math.max(0,remaining);
    })():null;
    return {fy,claim,wdv,label:fyDisplay(fy)};
  }).filter(r=>r.claim>0||(r.fy.startYear>=+purchaseFYKey));

  const totalClaim=fySchedule.reduce((s,r)=>s+r.claim,0);
  const unclaimed=Math.max(0,workAmt-totalClaim);

  // FY rows table
  const fyRows=fySchedule.map(r=>`<tr ${r.fy.startYear===+DB.currentFY?'style="font-weight:700;background:var(--euc-soft)"':''}>
    <td>${esc(r.label)}${r.fy.startYear===+DB.currentFY?' <span class="badge euc" style="font-size:.65rem">current</span>':''}</td>
    ${dev.method!=='immediate'?`<td class="num">${r.wdv!=null?fmt$(r.wdv):'—'}</td>`:''}
    <td class="num" style="color:var(--euc)">${r.claim>0?fmt$(r.claim):'<span class="muted">—</span>'}</td>
    <td>${r.fy.locked?'🔒 frozen':r.fy.startYear<+DB.currentFY?'<span class="muted">past</span>':'upcoming'}</td></tr>`).join('');

  // Life progress bar
  const pctClaimed=workAmt>0?Math.min(100,totalClaim/workAmt*100):0;
  const progressBar=`<div style="background:var(--surface2);border-radius:6px;height:8px;margin-top:8px;overflow:hidden">
    <div style="background:var(--euc);height:100%;width:${pctClaimed.toFixed(1)}%;transition:width .3s;border-radius:6px"></div></div>
    <div style="font-size:.78rem;color:var(--muted);margin-top:4px">${fmt$(totalClaim)} claimed of ${fmt$(workAmt)} (${pctClaimed.toFixed(0)}%)${unclaimed>0?' · '+fmt$(unclaimed)+' remaining':' · fully claimed'}</div>`;

  modal(`${esc(dev.name)} — depreciation schedule`,`
    <div class="grid2" style="gap:14px;margin-bottom:14px">
      <div>
        <div class="kv"><span class="k">Purchased</span><span class="v">${fmtDate(dev.date)}</span></div>
        <div class="kv"><span class="k">Purchase price</span><span class="v">${fmt$(dev.cost)}</span></div>
        <div class="kv"><span class="k">Work-related use</span><span class="v">${dev.workUse||100}%</span></div>
        <div class="kv"><span class="k">Deductible amount</span><span class="v">${fmt$(workAmt)}</span></div>
      </div>
      <div>
        <div class="kv"><span class="k">Depreciation method</span><span class="v">${methodLabel}</span></div>
        ${dev.method!=='immediate'?`<div class="kv"><span class="k">Effective life</span><span class="v">${dev.life} year${dev.life===1?'':'s'}</span></div>`:''}
        <div class="kv"><span class="k">Financial year purchased</span><span class="v">${esc(fyDisplay(purchaseFY))}</span></div>
      </div>
    </div>
    ${progressBar}
    <table class="tbl mt"><thead><tr>
      <th>Financial year</th>
      ${dev.method!=='immediate'?'<th class="num">Opening value</th>':''}
      <th class="num">Deduction claimable</th>
      <th>Status</th></tr></thead>
    <tbody>${fyRows}
      <tr class="total"><td colspan="${dev.method!=='immediate'?2:1}">Total claimed</td>
        <td class="num">${fmt$(totalClaim)}</td><td></td></tr>
    </tbody></table>
    ${dev.method!=='immediate'?'<div class="note">Opening value each year = prior year value minus prior year deduction. For diminishing value this compounds; for prime cost it\'s a fixed annual slice of the original cost.</div>':''}
    ${dev.method==='immediate'?'<div class="note">Immediate write-off: the full work-related cost is claimed in the purchase year in one go — no depreciation across future years.</div>':''}`,
    `<button class="btn" onclick="devAdd(${
      (() => {
        const b=bucket(purchaseFY,pid);
        return b.devices.findIndex(x=>x.id===devId);
      })()
    })">Edit device</button><button class="btn primary" data-close>Close</button>`);
}
/* For a device that's linked to an Expenses entry, deleting needs to happen
   from the expense side (expDelete) so both records are removed together —
   deleting only the device here would leave the expense pointing at a
   linkedDeviceId that no longer exists. */
function devDeleteLinked(expenseId){
  go('expenses');
  setTimeout(()=>{
    const idx=(PD().expenses||[]).findIndex(e=>e.id===expenseId);
    if(idx>=0)expDelete(idx);
    else toast("Couldn't find the linked expense — it may have already been removed");
  },150);
}
function devAdd(i){
  if(lockedGuard())return;
  const y=FY(),cap=y.rates.deviceImmediateCap;
  const d=i!=null?PD().devices[i]:{name:'',date:todayISO(),cost:'',workUse:100,method:'immediate',life:3};
  modal(i!=null?'Edit device':'Add work device',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Item</label><input id="f_n" class="input" value="${esc(d.name)}" placeholder="e.g. Jabra headset"></div>
    <div><label class="fld">Purchase date</label><input id="f_d" type="date" class="input" value="${d.date}"></div></div>
    <div class="fldrow mt"><div><label class="fld">Cost ($)</label><input id="f_c" class="input money" value="${d.cost}" oninput="devHint()"></div>
    <div><label class="fld">Work-related use (%)</label><input id="f_w" class="input money" value="${d.workUse}"></div></div>
    <div class="fldrow mt"><div><label class="fld">Method</label><select id="f_m" class="input" onchange="devHint()">
      <option value="immediate" ${d.method==='immediate'?'selected':''}>Immediate deduction (≤ ${fmt$0(cap)})</option>
      <option value="diminishing" ${d.method==='diminishing'?'selected':''}>Decline in value — diminishing value</option>
      <option value="prime" ${d.method==='prime'?'selected':''}>Decline in value — prime cost</option></select></div>
    <div><label class="fld">Effective life (years)</label><input id="f_l" class="input money" value="${d.life}"></div></div>
    <div class="note" id="devHint"></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="devSave(${i==null?'null':i})">Save</button>`);
  devHint();
}
function devHint(){
  const cap=FY().rates.deviceImmediateCap,c=num($('#f_c').value),mth=$('#f_m').value;
  const el=$('#devHint');if(!el)return;
  if(mth==='immediate'&&c>cap)el.innerHTML=`⚠️ This costs more than ${fmt$0(cap)} — the ATO generally requires depreciation instead of an immediate claim. Switch to a decline-in-value method.`;
  else if(mth==='immediate')el.innerHTML=`Items ≤ ${fmt$0(cap)} used mainly for work can be claimed in full this year.`;
  else el.innerHTML=mth==='diminishing'?'Diminishing value: 200% ÷ effective life applied to the written-down value each year — bigger deductions up front.':'Prime cost: an equal slice of the cost each year over the effective life.';
}
function devSave(i){
  const date=$('#f_d').value||todayISO();
  const newD={id:i!=null?PD().devices[i].id:uid(),name:$('#f_n').value.trim()||'Device',date,cost:num($('#f_c').value),workUse:num($('#f_w').value)||100,method:$('#f_m').value,life:num($('#f_l').value)||3};
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  // File the device under whichever FY's ACTUAL date range contains its
  // purchase date — not a naive calendar-year guess, since a FY's
  // startYear/key can drift from its real dates if the user has edited
  // start/end dates via Settings → rename. This matters most for
  // "immediate" write-offs, which only claim in the exact purchase year.
  const targetY=yearContainingDate(date);
  if(i!=null)PD().devices.splice(i,1); // remove from current bucket first (may be re-added below if same FY)
  if(targetY){
    bucket(targetY,pid).devices.push(newD);
    if(targetY.startYear!==FY().startYear||fyRange(targetY).start!==fyRange(FY()).start)toast(`Device saved — filed under ${fyDisplay(targetY)} to match its purchase date`);
    else{save();closeModal();render();toast('Device saved');return;}
  }else{
    PD().devices.push(newD);
    toast(`Saved, but no financial year covers ${fmtDate(date)} yet — create it in Tax settings (+ Add earlier FY) so this claims correctly. For now it's filed under the currently selected FY.`);
  }
  save();closeModal();render();
}

/* ================= DEDUCTIONS (formerly "Other deductions") ================= */
/* Navigate from the Deductions page to the Expenses page and open a
   specific expense's edit modal. Looks up the expense by id rather than
   array index, since the index can shift between pages. */
function expenseGoToEdit(expenseId){
  go('expenses');
  setTimeout(()=>{
    const idx=(PD().expenses||[]).findIndex(e=>e.id===expenseId);
    if(idx>=0)expAdd(idx);
  },150);
}
PAGES.other=m=>{
  const y=FY(),B=PD(),cap=y.rates.deviceImmediateCap;
  const pid0=isAll()?DB.people[0].id:DB.currentPid;
  const bd=fyTaxableBreakdown(y,pid0);
  head(m,'Deductions',`Everything you can claim for ${esc(fyDisplay(y))} — work-from-home, devices, donations, and other work-related expenses, all in one place.`,
    `<button class="btn" onclick="devAdd()">+ Add device</button>
     <button class="btn primary" onclick="othAdd()">+ Add deduction</button>`);
  const wfh=wfhTotals(y,B);
  m.insertAdjacentHTML('beforeend',`
  <div class="grid3" style="margin-bottom:14px">
    <div class="stat euc"><div class="l">Total deductions — ${esc(fyDisplay(y))}</div><div class="v">${fmt$0(bd.deductions)}</div><div class="d">everything claimable this FY, including property</div></div>
    <div class="stat"><div class="l">Work from home</div><div class="v" style="font-size:1.1rem">${fmt$0(wfh.claim)}</div><div class="d">${wfh.days||0} day${wfh.days===1?'':'s'} logged</div></div>
    <div class="stat"><div class="l">Devices & other deductions</div><div class="v" style="font-size:1.1rem">${fmt$0(bd.dev+bd.other+bd.expDed)}</div><div class="d">listed below</div></div>
  </div>
  <div class="card"><div class="cbody" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
    <div><div style="font-weight:700">Work from home</div><div class="muted" style="font-size:.84rem">${wfh.days||0} day${wfh.days===1?'':'s'} logged · ${esc(fyDisplay(y))}</div></div>
    <div style="text-align:right"><div style="font-size:1.3rem;font-weight:700;color:var(--euc)">${fmt$0(wfh.claim)}</div><a href="#" onclick="go('wfh');return false">Log days / manage ↗</a></div>
  </div></div>`);
  const rows=B.other.map((e,i)=>`<tr><td>${fmtDate(e.date)}</td><td><span class="badge euc">${esc(e.type)}</span></td><td>${esc(e.item)}</td>
    <td>${e.receiptId?`<span class="rcpt-file" onclick="rcptView('${e.receiptId}','${esc(e.item)}')">📎 ${esc(e.receiptName||'receipt')}</span>`:'<span class="muted">—</span>'}</td>
    <td class="num">${fmt$(e.amount)}</td>
    <td class="rowact"><button class="btn ghost small" onclick="othAdd(${i})">Edit</button>
    <button class="btn ghost small" onclick="if(!lockedGuard())confirmDel('Delete this deduction?',()=>{othDelete(${i})})">✕</button></td></tr>`).join('');
  const tot=B.other.reduce((s,e)=>s+num(e.amount),0);
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="cbody tight"><table class="tbl">
    <thead><tr><th>Date</th><th>Deduction type</th><th>Item</th><th>Receipt</th><th class="num">Amount</th><th></th></tr></thead>
    <tbody>${rows||'<tr><td colspan="6" class="muted">No other deductions yet.</td></tr>'}
    <tr class="total"><td colspan="4">Total other deductions</td><td class="num">${fmt$(tot)}</td><td></td></tr></tbody></table></div></div>`);
  // ---- deductible expenses from the Expenses page (non-property-linked) ----
  // expDeductibleAmt() is the same function the tax engine uses, so this list
  // always matches exactly what's counted in the deductions total above.
  const expRows=(B.expenses||[]).filter(e=>!e.assetId&&expDeductibleAmt(e)>0);
  if(expRows.length){
    const expTot=expRows.reduce((s,e)=>s+yearlyFromRec(expDeductibleAmt(e),e.recurrence),0);
    const rowsHtml=expRows.map(e=>{
      const ded=yearlyFromRec(expDeductibleAmt(e),e.recurrence);
      const full=yearlyFromRec(num(e.amount),e.recurrence);
      const dedLabel=ded>=full?'✓ fully deductible':`${fmt$0(ded)} of ${fmt$0(full)}`;
      return `<tr style="cursor:pointer" onclick="expenseGoToEdit('${e.id}')" title="Click to edit in Expenses">
        <td><b>${esc(e.name||e.category||'Expense')}</b><div class="muted" style="font-size:.78rem">${esc(e.category||'')}${e.dedItem?` · ${esc(e.dedItem)}`:''}</div></td>
        <td>${fmtDate(e.date||'')}</td>
        <td><span class="badge euc">${dedLabel}</span></td>
        <td class="num">${fmt$(ded)}</td></tr>`;
    }).join('');
    m.insertAdjacentHTML('beforeend',`
    <div class="card"><div class="chead"><h2>Deductible expenses</h2><span class="hint">from the Expenses page — click any row to edit there</span></div>
    <div class="cbody tight"><table class="tbl">
      <thead><tr><th>Expense</th><th>Date</th><th>Deductible</th><th class="num">Amount / yr</th></tr></thead>
      <tbody>${rowsHtml}
      <tr class="total"><td colspan="3">Total from Expenses page</td><td class="num">${fmt$(expTot)}</td></tr></tbody></table></div>
    <div class="note" style="margin:0 14px 14px">These are flagged as tax-deductible on individual entries in <a href="#" onclick="go('expenses');return false">Expenses</a> — click a row to edit it there. They're already included in the total deductions figure at the top of this page.</div></div>`);
  }
  // ---- investment property deductions (read-only here — edited in Assets) ----
  const propAssets=DB.assets.filter(a=>a.kind==='property'&&a.investment!==false&&(isAll()||a.pid===pid0));
  if(propAssets.length){
    let ptot=0;
    const lineRows=[];
    propAssets.forEach(a=>{
      const apid=a.pid;
      const B2=bucket(y,apid);
      const propTag=`${isAll()?pdot(person(apid))+' ':''}${esc(a.name)}`;
      assetExpensesOf(B2,a).forEach(e=>{
        const ded=propExpDeductibleEffective(e,B2,apid);
        if(!ded)return;
        ptot+=ded;
        lineRows.push({prop:propTag,assetId:a.id,date:e.date,type:esc(e.category||'Expense'),detail:esc(e.item||''),amt:ded,clickable:true});
      });
      const spread=costScheduleForFY(a,y);
      if(spread){ptot+=spread;lineRows.push({prop:propTag,assetId:a.id,date:'',type:'Borrowing cost spread',detail:'',amt:spread,clickable:true});}
      const mgmt=managementFeeForFY(a,y);
      if(mgmt){ptot+=mgmt;lineRows.push({prop:propTag,assetId:a.id,date:'',type:'Property management fee',detail:'Auto-calculated from rental income × fee %',amt:mgmt,clickable:true});}
      const dep=depreciationForFY(a,y);
      if(dep){ptot+=dep;lineRows.push({prop:propTag,assetId:a.id,date:'',type:'Depreciation',detail:'',amt:dep,clickable:true});}
    });
    lineRows.sort((x,y2)=>(x.date||'').localeCompare(y2.date||''));
    const propRows=lineRows.map(r=>`<tr style="${r.clickable?'cursor:pointer':''}" onclick="${r.clickable?`assetDetailOpen('${r.assetId}')`:''}" title="${r.clickable?'Click to open in Assets':''}">
      <td><b>${r.prop}</b></td><td>${r.date?fmtDate(r.date):'<span class="muted">—</span>'}</td><td>${r.type}</td><td class="muted" style="font-size:.82rem">${r.detail||'<span class="muted">—</span>'}</td><td class="num">${fmt$(r.amt)}</td></tr>`).join('');
    m.insertAdjacentHTML('beforeend',`
    <div class="card"><div class="chead"><h2>Investment property deductions</h2><span class="hint">click any row to open the property — edit there</span></div>
    <div class="cbody tight"><table class="tbl">
      <thead><tr><th>Property</th><th>Date</th><th>Deduction type</th><th>Detail</th><th class="num">Amount</th></tr></thead>
      <tbody>${propRows||'<tr><td colspan="5" class="muted">No deductible property items yet for this FY.</td></tr>'}
      <tr class="total"><td colspan="4">Total property deductions — ${esc(fyDisplay(y))}</td><td class="num">${fmt$(ptot)}</td></tr></tbody></table></div>
    <div class="note" style="margin:0 14px 14px">Read-only summary — click any row to open the property in Assets and edit there.</div></div>`);
  }
  // ---- work devices & equipment (depreciating assets), now part of this page ----
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const drows=[];
  Object.values(DB.years).sort((a,b)=>a.startYear-b.startYear).forEach(fy=>{
    bucket(fy,pid).devices.forEach((d,i)=>{
      const ded=deviceDeductionForFY(d,y);
      const owned=fy.startYear===y.startYear;
      if(ded>0||owned)drows.push({d,ded,owned,i,label:fy.label});
    });
  });
  const dtot=drows.reduce((s,r)=>s+r.ded,0);
  m.insertAdjacentHTML('beforeend',`
  <div class="card"><div class="chead"><h2>Work devices & equipment</h2>
    <span class="hint">≤ ${fmt$0(cap)} (work portion) claims immediately; dearer items decline in value over their effective life</span></div>
  <div class="cbody tight"><table class="tbl">
    <thead><tr><th>Item</th><th>Purchased</th><th class="num">Cost</th><th class="num">Work use</th><th>Method</th><th class="num">Claim in ${esc(y.label)}</th><th></th></tr></thead>
    <tbody>${drows.map(r=>`<tr>
      <td><button class="btn ghost" style="font-weight:700;text-align:left;padding:2px 6px;height:auto" onclick="devDetail('${r.d.id}','${r.label}')">${esc(r.d.name)}</button>
        ${r.owned?'':`<div class="muted" style="font-size:.72rem">added in ${esc(r.label)}</div>`}
        ${r.d.linkedExpenseId?`<div class="muted" style="font-size:.72rem">🧾 linked to an Expenses entry — <a href="#" onclick="expenseGoToEdit('${r.d.linkedExpenseId}')">edit there</a></div>`:''}</td>
      <td>${fmtDate(r.d.date)}</td><td class="num">${fmt$(r.d.cost)}</td><td class="num">${r.d.workUse||100}%</td>
      <td>${r.d.method==='immediate'?'<span class="badge euc">Immediate</span>':r.d.method==='diminishing'?`<span class="badge blue">Diminishing · ${r.d.life}y</span>`:`<span class="badge gold">Prime cost · ${r.d.life}y</span>`}</td>
      <td class="num"><b>${fmt$(r.ded)}</b></td>
      <td class="rowact">${r.owned?`<button class="btn ghost small" onclick="${r.d.linkedExpenseId?`expenseGoToEdit('${r.d.linkedExpenseId}')`:`devAdd(${r.i})`}">Edit</button>
      <button class="btn ghost small" onclick="${r.d.linkedExpenseId?`devDeleteLinked('${r.d.linkedExpenseId}')`:`if(!lockedGuard())confirmDel('Delete ${esc(r.d.name)}?',()=>{PD().devices.splice(${r.i},1);save();render()})`}">✕</button>`:''}</td></tr>`).join('')
      ||'<tr><td colspan="7" class="muted">Nothing yet — add that new headset.</td></tr>'}
    <tr class="total"><td colspan="5">Device deductions claimable in ${esc(y.label)}</td><td class="num">${fmt$(dtot)}</td><td></td></tr></tbody></table></div></div>
  <div class="note">Assets bought in earlier years keep depreciating into later years automatically (edit them in their purchase year). Once you pick diminishing value or prime cost for an asset, the ATO expects you to stick with it.</div>`);
};
async function othDelete(i){
  const e=PD().other[i];
  const rid=e.receiptId;
  PD().other.splice(i,1);save();render();
  if(rid&&!receiptStillReferenced(rid))await rcptDel(rid).catch(()=>{});
}
function othTypeChange(v){
  const isTravel=v==='Car travel — cents per km';
  $('#othStdFlds').style.display=isTravel?'none':'block';
  $('#othTravelFlds').style.display=isTravel?'block':'none';
  if(isTravel)othCalcTravel();
}
function othTravelModeChange(v){
  const el=$('#othTravelAddrFlds');if(el)el.style.display=v==='km'?'none':'block';
}
/* ---- Saved car-travel routes — named address pairs for quick reuse ---- */
function personSavedRoutes(pid){
  const p=person(pid);if(!p)return[];
  p.savedRoutes=p.savedRoutes||[];
  return p.savedRoutes;
}
function travelRouteSelect(sel){
  const routeId=sel.value;
  if(!routeId)return;
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const r=personSavedRoutes(pid).find(x=>x.id===routeId);
  if(!r)return;
  if($('#f_tfrom'))$('#f_tfrom').value=r.from;
  if($('#f_tto'))$('#f_tto').value=r.to;
}
function travelRouteManage(){
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const routes=personSavedRoutes(pid);
  const rows=routes.map((r,i)=>`<tr><td>${esc(r.label)}</td><td style="font-size:.82rem">${esc(r.from)}</td><td style="font-size:.82rem">${esc(r.to)}</td>
    <td class="rowact"><button class="btn ghost small" onclick="travelRouteDelete(${i})">✕</button></td></tr>`).join('');
  modal('Manage saved routes',`
    ${rows?`<table class="tbl"><thead><tr><th>Label</th><th>From</th><th>To</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="hint">No saved routes yet — add your common trips (e.g. home to work) once, then pick them from a dropdown each time instead of retyping addresses.</div>'}
    <div class="fldrow mt"><div><label class="fld">Label</label><input id="f_rtlabel" class="input" placeholder="e.g. Home → Office"></div></div>
    <div class="fldrow mt">
      <div style="flex:2"><label class="fld">From</label><input id="f_rtfrom" class="input" placeholder="e.g. 123 Smith St Melbourne VIC"></div>
      <div style="flex:2"><label class="fld">To</label><input id="f_rtto" class="input" placeholder="e.g. 456 Jones St Richmond VIC"></div>
    </div>`,
    `<button class="btn" data-close>Close</button><button class="btn primary" onclick="travelRouteAdd()">+ Add route</button>`);
}
function travelRouteAdd(){
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  const label=$('#f_rtlabel').value.trim(),from=$('#f_rtfrom').value.trim(),to=$('#f_rtto').value.trim();
  if(!label||!from||!to)return toast('Fill in label, from and to first');
  personSavedRoutes(pid).push({id:uid(),label,from,to});
  save();travelRouteManage();
}
function travelRouteDelete(i){
  const pid=isAll()?DB.people[0].id:DB.currentPid;
  personSavedRoutes(pid).splice(i,1);
  save();travelRouteManage();
}
async function othCalcDist(){
  const from=$('#f_tfrom').value.trim(), to=$('#f_tto').value.trim();
  if(!from||!to)return toast('Enter both addresses first');
  try{
    const km=await calcTravelDistance(from,to);
    $('#f_tkm').value=km.toFixed(1);
    othCalcTravel();
    toast(`Route: ${km.toFixed(1)} km`);
  }catch(e){toast('Could not calculate: '+e.message+' — enter km manually');}
}
function othCalcTravel(){
  const km=num($('#f_tkm').value);
  const trips=num($('#f_ttrips').value)||1;
  const dir=$('#f_tdir').value==='return'?2:1;
  const rate=num($('#f_trate').value)||FY().rates.centsPerKm;
  const total=km*trips*dir*rate;
  if($('#f_a2'))$('#f_a2').value=total.toFixed(2);
}
function othAdd(i){
  if(lockedGuard())return;
  const y=FY(),B=PD(),e=i!=null?B.other[i]:{date:todayISO(),type:ATO_DEDUCTION_TYPES[1],item:'',amount:''};
  const travelDed=e.type==='Car travel — cents per km';
  modal(i!=null?'Edit deduction':'Add deduction',`
    <div class="fldrow"><div><label class="fld">Date</label><input id="f_d" type="date" class="input" value="${e.date}"></div>
    <div style="flex:2"><label class="fld">Deduction type (ATO category)</label><select id="f_t" class="input" onchange="othTypeChange(this.value)">
      ${ATO_DEDUCTION_TYPES.map(t=>`<option ${e.type===t?'selected':''}>${t}</option>`).join('')}</select></div></div>
    <!-- standard fields -->
    <div id="othStdFlds" style="display:${travelDed?'none':'block'}">
      <div class="fldrow mt"><div style="flex:2"><label class="fld">Item</label><input id="f_i" class="input" value="${esc(e.item)}" placeholder="e.g. R&J Sanderson fee"></div>
      <div><label class="fld">Amount ($)</label><input id="f_a" class="input money" value="${e.amount}"></div></div>
    </div>
    <!-- car travel fields -->
    <div id="othTravelFlds" style="display:${travelDed?'block':'none'}">
      <div class="fldrow mt">
        <div><label class="fld">How do you want to enter this trip?</label>
          <select id="f_tmode" class="input" onchange="othTravelModeChange(this.value)">
            <option value="addr" ${(!e.travel||e.travel.mode!=='km')?'selected':''}>Calculate from addresses</option>
            <option value="km" ${e.travel&&e.travel.mode==='km'?'selected':''}>Enter km directly</option>
          </select>
        </div>
      </div>
      <div id="othTravelAddrFlds" style="display:${(!e.travel||e.travel.mode!=='km')?'block':'none'}">
        <div class="fldrow mt">
          <div style="flex:2"><label class="fld">Saved route <span class="muted">(optional — pick one to auto-fill below)</span></label>
            <div style="display:flex;gap:8px;align-items:center">
              <select id="f_troute" class="input" onchange="travelRouteSelect(this)" style="flex:1">
                <option value="">— choose a saved route —</option>
                ${personSavedRoutes(isAll()?DB.people[0].id:DB.currentPid).map(r=>`<option value="${r.id}">${esc(r.label)}</option>`).join('')}
              </select>
              <button class="btn small" type="button" onclick="travelRouteManage()">Manage routes</button>
            </div>
          </div>
        </div>
        <div class="fldrow mt">
          <div style="flex:2;position:relative"><label class="fld">From address</label><input id="f_tfrom" class="input" value="${esc(e.travel&&e.travel.from||'')}" placeholder="e.g. 123 Smith St Melbourne VIC" autocomplete="off" oninput="addrAutocomplete(this,'f_tfrom_sugg')" onblur="addrHide('f_tfrom_sugg')"><div id="f_tfrom_sugg" class="addr-sugg"></div></div>
          <div style="flex:2;position:relative"><label class="fld">To address</label><input id="f_tto" class="input" value="${esc(e.travel&&e.travel.to||'')}" placeholder="e.g. 456 Jones St Richmond VIC" autocomplete="off" oninput="addrAutocomplete(this,'f_tto_sugg')" onblur="addrHide('f_tto_sugg')"><div id="f_tto_sugg" class="addr-sugg"></div></div>
          <div style="flex:0"><label class="fld">&nbsp;</label><button class="btn" onclick="othCalcDist()" type="button">Calculate km</button></div>
        </div>
      </div>
      <div class="fldrow mt">
        <div><label class="fld">Distance (km)</label><input id="f_tkm" class="input money" value="${e.travel&&e.travel.km||''}" oninput="othCalcTravel()"></div>
        <div><label class="fld">Number of trips</label><input id="f_ttrips" class="input money" value="${e.travel&&e.travel.trips||1}" oninput="othCalcTravel()"></div>
        <div><label class="fld">Direction</label><select id="f_tdir" class="input" onchange="othCalcTravel()">
          <option value="oneway" ${(e.travel&&e.travel.direction)==='oneway'?'selected':''}>One way</option>
          <option value="return" ${(!e.travel||e.travel.direction==='return')?'selected':''}>Return (×2)</option></select></div>
        <div><label class="fld">Rate ($/km)</label><input id="f_trate" class="input money" value="${e.travel?e.travel.ratePerKm:FY().rates.centsPerKm}" oninput="othCalcTravel()" readonly style="background:var(--surface2);color:var(--muted)" title="Rate is set in Tax settings for this FY"></div>
      </div>
      <div class="fldrow mt"><div style="flex:2"><label class="fld">Purpose / item</label><input id="f_i2" class="input" value="${esc(e.item)}" placeholder="e.g. Home to work site"></div>
      <div><label class="fld">Total claim ($)</label><input id="f_a2" class="input money" value="${e.amount}" placeholder="auto-calculated"></div></div>
      <div class="note">ATO ${FY().rates.centsPerKm} cents/km rate for ${esc(fyDisplay(FY()))}. The distance is calculated via Open Street Map — verify matches the ATO's shorter / more direct route allowance, or switch to "Enter km directly" if you already know the distance.</div>
    </div>
    <div class="mt"><label class="fld">Receipt (optional)</label><input id="f_r" type="file" class="input" accept="image/*,.pdf"></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="othSave(${i==null?'null':i})">Save</button>`);
}
async function othSave(i){
  const B=PD();
  const e=i!=null?{...B.other[i]}:{id:uid()};
  const isTravel=$('#f_t').value==='Car travel — cents per km';
  e.date=$('#f_d').value;e.type=$('#f_t').value;
  e.item=(isTravel?$('#f_i2'):$('#f_i')).value.trim();
  e.amount=num((isTravel?$('#f_a2'):$('#f_a')).value);
  if(isTravel){
    e.travel={mode:$('#f_tmode')?.value||'addr',from:$('#f_tfrom').value.trim(),to:$('#f_tto').value.trim(),
      km:num($('#f_tkm').value),trips:num($('#f_ttrips').value)||1,
      direction:$('#f_tdir').value,ratePerKm:num($('#f_trate').value)||FY().rates.centsPerKm};
  }else{delete e.travel;}
  const file=$('#f_r')?.files[0];
  if(file){e.receiptId=e.receiptId||uid();e.receiptName=file.name;}
  if(i!=null)B.other[i]=e;else B.other.push(e);
  save();closeModal();render();toast('Deduction saved');
  if(file){
    try{
      await rcptPut({id:e.receiptId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(FY()),category:'Other Deductions',date:e.date,itemName:e.item,pid:isAll()?DB.people[0].id:DB.currentPid});
      render();
    }catch(_){toast("Deduction saved — couldn't attach the file, try re-attaching from the deduction row");}
  }
}

/* ============ DRIVE DATA SYNC ============ */
const SYNC_FILE='data.json';
const VERSIONS_FOLDER=['Applications','Ledger','versions'];
let _syncTimer=null,_syncStatus=''; // 'syncing'|'synced'|'error'|''
/* ================= VERSION HISTORY =================
   Before overwriting data.json for the FIRST push of a new calendar day,
   the about-to-be-replaced content is copied into Ledger/versions/ as
   YYYY-MM-DD.json — a snapshot of "everything as it stood at the start of
   today". This means a fat-fingered edit can always be undone by reverting
   to yesterday's (or any earlier day's) snapshot. Snapshots older than 3
   months are purged automatically whenever a new one is taken. */
function snapshotRetentionCutoffISO(){
  const d=new Date();d.setUTCMonth(d.getUTCMonth()-3);
  return iso(d);
}
async function purgeOldVersions(){
  try{
    const files=await GD.listFiles(VERSIONS_FOLDER);
    const cutoff=snapshotRetentionCutoffISO();
    for(const f of files){
      const m=f.name.match(/^(\d{4}-\d{2}-\d{2})/);
      if(m&&m[1]<cutoff)await GD.deleteFile(f.id).catch(()=>{});
    }
  }catch(e){}
}
/* Called at the start of every pushToDrive(). Cheap no-op once per day. */
async function snapshotIfNeeded(){
  const today=todayISO();
  if(DB._lastSnapshotDate===today)return;
  try{
    const current=await GD.readJSON(SYNC_FILE);
    if(current)await GD.writeJSON(`${today}.json`,current,VERSIONS_FOLDER);
  }catch(e){/* don't block the actual save on snapshot failure */}
  DB._lastSnapshotDate=today;
  purgeOldVersions(); // fire-and-forget
}
/* Lists available version snapshots, newest first, with a friendly label. */
async function listVersions(){
  if(!GD.isConnected())return [];
  try{
    const files=await GD.listFiles(VERSIONS_FOLDER);
    return files.map(f=>{
      const m=f.name.match(/^(\d{4}-\d{2}-\d{2})(?:_(\d{2})(\d{2})(\d{2})_(\w+))?\.json$/);
      const date=m?m[1]:f.name;
      const tag=m?m[5]:null;
      const isPrerevert=tag==='prerevert';
      const isManual=tag==='manual';
      const label=isPrerevert
        ? `${fmtDate(date)} ${m[2]}:${m[3]}:${m[4]} — just before a revert`
        : isManual
        ? `${fmtDate(date)} ${m[2]}:${m[3]}:${m[4]} — manually created`
        : `${fmtDate(date)} — start of day`;
      return{id:f.id,name:f.name,date,isPrerevert,isManual,label};
    }).sort((a,b)=>b.name<a.name?-1:1);
  }catch(e){toast('Could not list versions: '+e.message);return [];}
}
/* On-demand snapshot of the CURRENT state, timestamped (distinct from the
   once-a-day automatic snapshot) — used before destructive operations like
   "Clean slate" so there's always a safety net regardless of whether
   today's automatic snapshot has already happened. Mirrors the pre-revert
   snapshot taken inside revertToVersion(). */
async function createVersionNow(){
  if(!GD.isConnected())return toast('Connect Google Drive first to use version history');
  toast('Creating version…');
  const ok=await snapshotNow('manual');
  if(ok){toast('Version created');renderVersionHistory();}
  else toast('Could not create version — try again');
}
async function snapshotNow(suffix){
  if(!GD.isConnected())return false;
  try{
    const now=new Date();
    const ts=`${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    const payload={...DB};
    if(payload.rcptMeta)Object.values(payload.rcptMeta).forEach(m=>{delete m.blob;});
    await GD.writeJSON(`${todayISO()}_${ts}_${suffix}.json`,JSON.stringify(payload),VERSIONS_FOLDER);
    DB._lastSnapshotDate=todayISO();
    return true;
  }catch(e){return false;}
}
/* Reverts DB to a previously-saved version. Always snapshots the CURRENT
   state first (timestamped, distinct from the daily snapshot) so reverting
   is itself reversible. */
async function revertToVersion(fileName){
  if(!GD.isConnected())return;
  try{
    setSyncStatus('syncing','⟳ Reverting…');
    const now=new Date();
    const ts=`${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    const preRevertPayload={...DB};
    if(preRevertPayload.rcptMeta)Object.values(preRevertPayload.rcptMeta).forEach(m=>{delete m.blob;});
    await GD.writeJSON(`${todayISO()}_${ts}_prerevert.json`,JSON.stringify(preRevertPayload),VERSIONS_FOLDER);
    const text=await GD.readJSON(fileName,VERSIONS_FOLDER);
    if(!text)throw new Error('version file not found');
    DB=ensureDbShape(JSON.parse(text));
    DB._lastSnapshotDate=todayISO(); // pre-revert snapshot just covered "today" already
    save();initFYSelect();render();
    await pushToDrive();
    toast('Reverted — your previous state was saved as a snapshot too');
  }catch(e){
    setSyncStatus('error','⚠ Revert failed');
    toast('Revert failed: '+e.message);
  }
}
function getDeviceId(){
  let id=localStorage.getItem('ledger-device-id');
  if(!id){id=uid();localStorage.setItem('ledger-device-id',id);}
  return id;
}
function setSyncStatus(s,msg){
  _syncStatus=s;
  const el=document.getElementById('syncStatus');
  if(!el)return;
  const labels={syncing:'⟳ Syncing…',synced:'✓ Synced',error:'⚠ Sync error',off:''};
  const colors={syncing:'var(--muted)',synced:'var(--euc)',error:'var(--red)',off:''};
  el.textContent=msg||labels[s]||'';
  el.style.color=colors[s]||'var(--muted)';
}
function scheduleDriveSync(){
  if(!GD.isConnected())return;
  clearTimeout(_syncTimer);
  setSyncStatus('syncing');
  _syncTimer=setTimeout(pushToDrive,3000);
}
async function pushToDrive(){
  if(!GD.isConnected())return;
  try{
    await snapshotIfNeeded();
    const ts=Date.now(),device=getDeviceId();
    // Strip blobs from the export — receipts are already individual Drive files
    const payload={...DB,_syncTs:ts,_syncDevice:device};
    // Remove any lingering blob data from rcptMeta (it's already in Drive)
    if(payload.rcptMeta)Object.values(payload.rcptMeta).forEach(m=>{delete m.blob;});
    await GD.writeJSON(SYNC_FILE,JSON.stringify(payload));
    // Record what we just pushed so future comparisons know this device is
    // up to date — without this, DB._syncTs would stay stale and Drive
    // would always look "newer" even right after this device pushed.
    DB._syncTs=ts;DB._syncDevice=device;
    try{localStorage.setItem(LS_KEY,JSON.stringify(DB));}catch(e){}
    setSyncStatus('synced','✓ Synced '+new Date().toLocaleTimeString());
  }catch(e){
    setSyncStatus('error','⚠ Sync error: '+e.message);
    console.error('Drive sync error:',e);
  }
}
async function pullFromDrive(silent){
  if(!GD.isConnected())return null;
  try{
    const text=await GD.readJSON(SYNC_FILE);
    if(!text)return null;
    return JSON.parse(text);
  }catch(e){
    if(!silent)toast('Could not read Drive data: '+e.message);
    return null;
  }
}
/* Loads driveData into DB without triggering an immediate push back to
   Drive (which would otherwise happen via save() -> scheduleDriveSync). */
function applyDriveData(driveData){
  _suppressSync=true;
  // Must run both passes — same as load() — so very old data pushed from
  // another device gets the full migration chain before being applied here.
  DB=ensureDbShape(driveData);save();initFYSelect();render();
  _suppressSync=false;
}
/* Google Drive is the source of truth. If Drive has newer data than this
   device, load it silently — no prompts. If this device's data is newer
   (or Drive is empty / unreachable), push local up. Local storage is just
   a working cache; Drive is canonical. */
async function initDriveSync(){
  if(!GD.isConnected())return;
  setSyncStatus('syncing','⟳ Checking Drive…');
  const driveData=await pullFromDrive(true);
  if(!driveData){
    // No Drive data yet — push local state up to become the canonical copy
    await pushToDrive();
    return;
  }
  const localTs=DB._syncTs||0;
  const driveTs=driveData._syncTs||0;
  if(driveTs>localTs){
    applyDriveData(driveData);
    setSyncStatus('synced','✓ Synced');
    return;
  }
  if(driveTs<localTs){
    // Local is genuinely ahead (e.g. an edit was made but the page closed
    // before the 3s debounced push completed) — push it up.
    await pushToDrive();
    return;
  }
  // Already in sync — nothing to do. Crucially, this means simply OPENING
  // the app (no edits) never triggers a Drive write or a version snapshot;
  // those only happen via scheduleDriveSync() in response to an actual edit.
  setSyncStatus('synced','✓ Synced');
}
/* Periodic background sync every 30s — silently pulls newer data saved
   from another device, no prompts. */
setInterval(async()=>{
  if(!GD.isConnected())return;
  try{
    const d=await pullFromDrive(true);
    if(!d)return;
    const driveTs=d._syncTs||0;
    const localTs=DB._syncTs||0;
    if(driveTs>localTs&&d._syncDevice!==getDeviceId()){
      applyDriveData(d);
      setSyncStatus('synced','✓ Synced from another device');
      toast('Synced latest data from another device');
    }
  }catch(e){}
},30000);
/* Net capital gain for a person/FY, applying the 50% CGT discount for
   assets held 12 months or more (individuals only — this app doesn't
   model trusts/companies/super funds, which get different discount
   rates). Losses are never discounted and are offset against
   non-discount-eligible gains FIRST, then against discount-eligible
   gains if any loss remains — this ordering gives the lowest net gain,
   per the ATO's own guidance ("subtract your losses from [non-discount]
   gains first... this will give you the best result").
   Holding period uses a 365-day approximation of the ATO's "at least 12
   months, excluding both the acquisition and disposal dates" rule —
   exact boundary cases (e.g. exactly 365 vs 366 days) should be checked
   against the precise ATO rule before lodging. */
function cgtBreakdown(b){
  let gainDiscount=0,gainFull=0,loss=0;
  (b.sales||[]).forEach(s=>{
    const g=num(s.proceeds)-num(s.costBase);
    if(g>0){
      const heldDays=s.buyDate&&s.sellDate?(new Date(s.sellDate+'T00:00:00Z')-new Date(s.buyDate+'T00:00:00Z'))/86400000:0;
      if(heldDays>=365)gainDiscount+=g;else gainFull+=g;
    }else loss+=-g;
  });
  // Fund/trust-distributed capital gains pool into the SAME CGT calculation
  // as share sales — the ATO applies all available losses (current year +
  // prior year carried forward) against the combined total of every capital
  // gain for the year, not just the ones from logged share sales. Without
  // this, a fund's capital gain would stay fully taxable even when the
  // person has carried-forward losses that would otherwise wipe it out.
  //
  // IMPORTANT: losses are applied against the GROSS pre-discount amount
  // (label 18H), not the already-halved 18A — verified against a real ATO
  // return where $10,393 of prior losses fully absorbed $120 of gross fund
  // gains (18H), reducing net capital gain (18A-equivalent) to exactly $0,
  // with $10,273 carried forward (10,393−120). Applying losses to the
  // post-discount 18A instead would only consume half as much loss balance
  // for the same gain, which doesn't match how the ATO actually calculates
  // it. AMIT funds report 18A net of their own internal 50% discount
  // already (confirmed: 18A is consistently ~half of 18H across funds), so
  // 18H is pooled into the discount-eligible bucket alongside share sales
  // held 12+ months — both get the 50% reduction applied AFTER losses, not
  // before. This assumes fund gains are discount-method, which covers the
  // overwhelming majority of real-world AMIT distributions (the "other
  // method" / non-discount alternative is rare for retail unit holders and
  // isn't separately tracked by this app's fund labels).
  const fundGain18H=(b.funds||[]).reduce((s,f)=>s+num(f.labels?.['18H']),0);
  gainDiscount+=fundGain18H;

  const priorLosses=Math.max(0,num(b.priorCapitalLosses));
  const lossPool=loss+priorLosses;

  const fullAfterLoss=Math.max(0,gainFull-lossPool);
  const lossLeftAfterFull=Math.max(0,lossPool-gainFull);
  const discountAfterLoss=Math.max(0,gainDiscount-lossLeftAfterFull);
  const lossesCarriedForward=Math.max(0,lossLeftAfterFull-gainDiscount);

  const grossGain=gainFull+gainDiscount; // before discount/losses — myTax item 18H combined (now includes fund 18H)
  const netCG=fullAfterLoss+discountAfterLoss*0.5; // after losses/discount — myTax item 18A combined
  return{grossGain,netCG,gainDiscount,gainFull,loss,priorLosses,discountAfterLoss,fullAfterLoss,lossesCarriedForward};
}
function fyTaxableBreakdown(y,pid){
  const b=bucket(y,pid);
  const R=y.rates;
  const incomes=b.incomes.reduce((s,r)=>s+num(r.yearly),0);
  const withheld=b.incomes.reduce((s,r)=>s+num(r.taxWithheld),0);
  const divPay=b.dividends.reduce((s,d)=>s+num(d.payment),0);
  const divCr=b.dividends.reduce((s,d)=>s+num(d.frankingCredit),0);
  const {assess:fundAssessRaw,offsets:fundOffsets,ded:fundDed}=fundLabelTotals(b);
  const cgt=cgtBreakdown(b);
  const netCG=cgt.netCG;
  // 18A (fund-distributed capital gains) is now pooled into cgtBreakdown's
  // loss/discount calculation above instead of being added to assessable
  // income raw — exclude it here to avoid double-counting. MFD_INCOME_LABELS
  // itself is left untouched since the Funds page table, myTax mapping and
  // FY-summary per-fund display rows still need to show the raw 18A figure
  // per fund (display purposes only — the actual tax calculation routes
  // through cgt.netCG instead, which already incorporates 18A correctly).
  const fund18ARaw=(b.funds||[]).reduce((s,f)=>s+num(f.labels?.['18A']),0);
  const fundAssess=fundAssessRaw-fund18ARaw;
  const wfh=wfhTotals(y,b);
  const prop=b.property.expenses.reduce((s,e)=>s+propExpDeductibleEffective(e,b,pid),0);
  const myAssets=assetsForPerson([pid]);
  const propertyAssets=myAssets.filter(a=>a.kind==='property');
  const mgmtFee=propertyAssets.reduce((s,a)=>s+managementFeeForFY(a,y),0);
  const depreciation=propertyAssets.reduce((s,a)=>s+depreciationForFY(a,y),0);
  // Borrowing/purchase costs spread over multiple years (e.g. loan
  // establishment fees, LMI) — a deduction only, never a cash expense.
  const costSpread=myAssets.reduce((s,a)=>s+costScheduleForFY(a,y),0);
  const other=b.other.reduce((s,e)=>s+num(e.amount),0);
  let dev=0;Object.values(DB.years).forEach(fy=>bucket(fy,pid).devices.forEach(d=>dev+=deviceDeductionForFY(d,y)));
  // Deductible expenses from the Expenses page — only those NOT linked to a property
  // asset. Asset-linked ones are synced into b.property.expenses and already counted
  // via `prop` above; including them here would double-count the deductible amount.
  const expDed=(b.expenses||[]).filter(e=>!e.assetId).reduce((s,e)=>s+yearlyFromRec(expDeductibleAmt(e),e.recurrence),0);
  // Rental income from property assets (auto-calculated from rental history)
  const rentalIncome=assetsForPerson([pid]).filter(a=>a.kind==='property'&&a.rental?.history?.length)
    .reduce((s,a)=>s+rentalIncomeEffective(a,y),0);
  // Pre-tax salary-sacrifice deductions (additional super, novated lease,
  // etc) reduce taxable income directly — separate from "deductions"
  // claimed at tax time (WFH, property, devices, other).
  const preTaxTotal=(b.preTaxDeds||[]).reduce((s,r)=>s+num(r.yearly),0);
  const assessable=incomes+divPay+divCr+fundAssess+netCG+rentalIncome;
  const deductions=wfh.claim+prop+mgmtFee+depreciation+costSpread+other+dev+fundDed+expDed;
  const taxable=Math.max(0,assessable-deductions-preTaxTotal);
  return{incomes,withheld,divPay,divCr,fundAssess,fundDed,fundOffsets,netCG,cgt,wfh,prop,mgmtFee,depreciation,costSpread,other,dev,expDed,rentalIncome,preTaxTotal,assessable,deductions,taxable};
}
function fySummaryNumbers(y,pid){
  const b=bucket(y,pid);
  const R=y.rates,o=b.summaryOpts||(b.summaryOpts={medicare:true,mls:false,hasCover:true});
  const bd=fyTaxableBreakdown(y,pid);
  const {taxable,assessable}=bd;
  // Family MLS: assessed on COMBINED household taxable income against
  // family thresholds (roughly double the singles tiers, plus an amount
  // per dependent beyond the first). Each person without cover then pays
  // the surcharge on their OWN taxable income at that household-derived rate.
  let mlsRate=null;
  if(o.mls&&y.mlsFamily?.enabled&&DB.people.length>1&&R.mlsFamily){
    const householdTaxable=DB.people.reduce((s,p)=>s+fyTaxableBreakdown(y,p.id).taxable,0);
    const dependents=Math.max(1,num(y.mlsFamily.dependents)||1);
    const bump=(dependents-1)*(R.mlsFamily.dependentIncrement||0);
    mlsRate=0;
    R.mlsFamily.tiers.forEach(t=>{if(householdTaxable>=t.min+bump)mlsRate=t.rate;});
  }
  const tax=fullTax(taxable,R,{...o,mlsRate});
  const offsets=bd.divCr+bd.fundOffsets;
  const paygInstalments=num(b.summaryOpts?.paygInstalments)||0;
  const balance=bd.withheld+paygInstalments+offsets-tax.total; // + = refund estimate
  const effRate=assessable>0?tax.total/assessable*100:0;
  return{...bd,tax,offsets,balance,paygInstalments,effRate,mlsRate};
}
/* ---- myTax mapping: lines up this FY's figures with myTax's labels ----
   Sections below are ordered and labelled to match the ATO individual tax
   return / myTax layout itself (item numbers + field letters: L, M, S, T,
   U, A, H, E, P, Q, F etc) rather than Ledger's own internal groupings, so
   the page can be read side-by-side with myTax (or a paper/PDF copy from
   a tax agent) and filled in section by section. Field letters are only
   shown where they're stable across years and confirmed against a real
   ATO individual return — where Ledger doesn't track an item at all (e.g.
   item 2, IT1-IT5/IT7/IT8, M1/M2), it's listed in the "not tracked" card
   at the bottom rather than guessed at. */
const INCOME_KIND_MYTAX={
  'Business / side income':'Item 5 or 15 — Business income (check which applies to you)',
  'Other':'Item 24 — Other income',
};
// Maps each "Other deductions" ATO category to the myTax D-item it belongs
// under, so deductions can be grouped into one card per D-item (matching
// the return's layout) instead of one flat list.
const OTH_DED_MYTAX_ITEM={
  'Working from home':{item:'D5',title:'D5 — Other work-related expenses'},
  'Tax prep / managing tax affairs':{item:'D10',title:'D10 — Cost of managing tax affairs'},
  'Self-education':{item:'D4',title:'D4 — Work-related self-education expenses'},
  'Tools & equipment':{item:'D5',title:'D5 — Other work-related expenses'},
  'Travel & transport':{item:'D2',title:'D2 — Work-related travel expenses'},
  'Car expenses':{item:'D1',title:'D1 — Work-related car expenses'},
  'Car travel — cents per km':{item:'D1',title:'D1 — Work-related car expenses'},
  'Clothing & laundry':{item:'D3',title:'D3 — Work-related clothing, laundry and dry-cleaning expenses'},
  'Phone, data & internet':{item:'D5',title:'D5 — Other work-related expenses'},
  'Subscriptions, software & union fees':{item:'D5',title:'D5 — Other work-related expenses'},
  'Donations & gifts':{item:'D9',title:'D9 — Gifts or donations'},
  'Income protection insurance':{item:'D15',title:'D15 — Other deductions'},
  'Personal super contributions':{item:'D12',title:'D12 — Personal superannuation contributions'},
  'Interest & dividend deductions':{item:'D7D8',title:'D7 / D8 — Interest and dividend deductions'},
  'Other work-related expenses':{item:'D5',title:'D5 — Other work-related expenses'},
};
// Single-letter field confirmed against a real ATO individual return for
// each D-item. Left blank where unconfirmed — better to say "check myTax"
// than to print a guessed letter.
const D_LETTER={D1:'A',D3:'C',D4:'D',D5:'E',D9:'J',D10:'M'};
const D_ORDER=['D1','D2','D3','D4','D5','D9','D10','D12','D15','D7D8'];
// Fund/trust AMIT labels (see MFD_LABELS) split by which return item they
// actually belong to — 13 (trusts), 18 (capital gains) and 20 (foreign
// income) — since a single fund's statement feeds three different items.
const FUND_ITEM_CODES={13:['13L','13U','13C','13Y','13Q'],18:['18A','18H'],20:['20E','20M','20F','20O']};
let MYTAX_COLLAPSED=new Set(); // section keys collapsed by the user, transient — starts all-expanded
function mytaxToggle(key){
  if(MYTAX_COLLAPSED.has(key))MYTAX_COLLAPSED.delete(key);else MYTAX_COLLAPSED.add(key);
  render();
}
function mytaxCollapseAll(keys){keys.forEach(k=>MYTAX_COLLAPSED.add(k));render();}
function mytaxExpandAll(){MYTAX_COLLAPSED.clear();render();}
/* ---- Filed / not-yet-filed status + Notice of Assessment attachment ----
   Stored per person+FY on the bucket itself (b.myTax), same place as every
   other per-person-per-year record, so it follows FY locking/export/clean
   slate behaviour for free. */
function mytaxBucket(){const b=PD();return b.myTax||(b.myTax={status:'unfiled',filedDate:'',receiptId:'',receiptName:'',notes:''});}
function mytaxFiledOpen(){
  const mt=mytaxBucket();
  const s=fySummaryNumbers(FY(),DB.currentPid);
  modal('Mark as filed',`
    <div class="hint">Record that ${esc(fyDisplay(FY()))}'s return has been lodged. Enter the ATO's final outcome to compare against Ledger's estimate.</div>
    <div class="fldrow mt">
      <div><label class="fld">Date filed</label><input id="mt_date" type="date" class="input" value="${mt.filedDate||todayISO()}"></div>
      <div><label class="fld">ATO outcome</label>
        <select id="mt_outcome" class="input">
          <option value="refund" ${mt.atoOutcome!=='owing'?'selected':''}>Refund</option>
          <option value="owing" ${mt.atoOutcome==='owing'?'selected':''}>Amount owing</option>
        </select>
      </div>
      <div><label class="fld">ATO amount ($)</label><input id="mt_amount" class="input money" value="${mt.atoAmount||''}" placeholder="e.g. 2662.43"></div>
    </div>
    ${s.balance!=null?`<div class="hint" style="margin-top:8px">Ledger estimate: <b>${fmt$(Math.abs(s.balance))}</b> ${s.balance>=0?'refund':'owing'}</div>`:''}
    <div class="mt"><label class="fld">Notes <span class="muted">(optional)</span></label><input id="mt_notes" class="input" value="${esc(mt.notes||'')}" placeholder="e.g. amendment needed next year, accountant follow-up"></div>
    <div class="mt"><label class="fld">Notice of assessment <span class="muted">(optional)</span></label><input id="mt_rcpt" type="file" class="input" accept="image/*,.pdf"></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="mytaxFiledSave()">Mark as filed</button>`);
}
async function mytaxFiledSave(){
  const mt=mytaxBucket();
  mt.status='filed';
  mt.filedDate=$('#mt_date').value||todayISO();
  mt.atoOutcome=$('#mt_outcome')?.value||'refund';
  mt.atoAmount=num($('#mt_amount').value)||0;
  mt.notes=$('#mt_notes')?.value.trim()||'';
  const file=$('#mt_rcpt')?.files[0];
  closeModal();save();render();
  toast('Marked as filed');
  if(file){
    const oldRid=mt.receiptId;
    mt.receiptId=uid();mt.receiptName=file.name;
    save();render();
    toast('Attaching notice of assessment…');
    try{
      await rcptPut({id:mt.receiptId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(FY()),category:'Notice of Assessment',date:mt.filedDate,itemName:'Notice of assessment',pid:isAll()?DB.people[0].id:DB.currentPid});
      if(oldRid&&!receiptStillReferenced(oldRid))await rcptDel(oldRid).catch(()=>{});
      toast('Notice of assessment attached');render();
    }catch(e){toast("Couldn't attach notice of assessment — try again from this page");}
  }
}
function fbtBucket(){const b=PD();return b.fbt||(b.fbt={amount:0,receiptId:'',receiptName:''});}
function fbtAmountSave(v){fbtBucket().amount=num(v);save();render();}
function fbtAttachOpen(){
  const fb=fbtBucket();
  modal('FBT statement',`
    <div class="hint">Attach the FBT statement from your employer showing your reportable fringe benefits amount for ${esc(fyDisplay(FY()))} (the FBT year runs 1 April – 31 March, a few months out of step with the income year, but the amount reported is for this income year).</div>
    <div class="mt"><label class="fld">File ${fb.receiptId?'(replaces existing)':''}</label><input id="fbt_rcpt" type="file" class="input" accept="image/*,.pdf"></div>`,
    `<button class="btn" data-close>Cancel</button>${fb.receiptId?`<button class="btn ghost" onclick="fbtDetachStatement()">Remove</button>`:''}<button class="btn primary" onclick="fbtAttachSave()">Attach</button>`);
}
async function fbtAttachSave(){
  const fb=fbtBucket();
  const file=$('#fbt_rcpt')?.files[0];
  if(!file)return toast('Choose a file first');
  const oldRid=fb.receiptId;
  fb.receiptId=uid();fb.receiptName=file.name;
  closeModal();save();render();
  toast('Attaching…');
  try{
    await rcptPut({id:fb.receiptId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(FY()),category:'FBT Statement',date:todayISO(),itemName:'FBT statement',pid:isAll()?DB.people[0].id:DB.currentPid});
    if(oldRid&&!receiptStillReferenced(oldRid))await rcptDel(oldRid).catch(()=>{});
    toast('FBT statement attached');render();
  }catch(e){toast("Couldn't attach FBT statement — try again");}
}
function fbtDetachStatement(){
  const fb=fbtBucket();
  if(fb.receiptId)rcptDel(fb.receiptId).catch(()=>{});
  fb.receiptId='';fb.receiptName='';
  closeModal();save();render();toast('Attachment removed');
}
function fbtCard(){
  const fb=fbtBucket();
  const key='IT1 — Reportable fringe benefits';
  const collapsed=MYTAX_COLLAPSED.has(key);
  if(collapsed) return `<div class="card"><div class="chead" style="cursor:pointer" onclick="mytaxToggle('${key}')">
    <h2><span style="display:inline-block;width:1em">▸</span>IT1 — Reportable fringe benefits</h2>
    <span class="badge muted" style="font-size:.72rem">Not applicable — click to expand</span>
  </div></div>`;
  return `<div class="card"><div class="chead" style="cursor:pointer" onclick="mytaxToggle('${key}')"><h2><span style="display:inline-block;width:1em">▾</span>IT1 — Reportable fringe benefits</h2></div>
  <div class="cbody mytax-body">
    <div class="hint">If your employer provided fringe benefits (e.g. novated lease, private health) totalling more than $2,000 in the FBT year, the grossed-up amount appears on your income statement as "Reportable fringe benefits amount". It isn't included in taxable income but affects Medicare levy surcharge, HELP/HECS repayment income, and other tests.</div>
    <div class="fldrow mt">
      <div><label class="fld">Reportable fringe benefits amount ($) <span class="muted">(from income statement)</span></label>
        <input class="input money" value="${fb.amount||''}" onchange="fbtAmountSave(this.value)" placeholder="0.00"></div>
    </div>
    <div class="mt"><label class="fld">FBT-exempt fringe benefits <span class="muted">(optional — e.g. EV novated lease, eligible work expenses)</span></label>
      <div class="hint" style="margin-bottom:6px">Some benefits are exempt from FBT (e.g. electric vehicles under a novated lease from 1 Jul 2022, portable electronic devices, work-related items). Enter the grossed-up value here for your own records — <b>exempt amounts are not reportable</b> and don't need to be entered on your tax return.</div>
      <input class="input money" style="max-width:200px" value="${fb.exemptAmount||''}" onchange="fbtBucket().exemptAmount=num(this.value);save()" placeholder="0.00"></div>
    <div class="mt" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        ${fb.receiptId?`<span class="rcpt-file" onclick="rcptView('${fb.receiptId}','FBT statement')">📎 ${esc(fb.receiptName||'FBT statement')}</span>`:''}
        <button class="btn small" onclick="fbtAttachOpen()">${fb.receiptId?'Replace / remove':'+ Attach'} FBT statement</button>
      </span>
      <button class="btn ghost small" onclick="mytaxToggle('${key}')">▸ Not applicable — hide this section</button>
    </div>
  </div></div>`;
}
function mytaxUnfile(){
  confirmAction('Mark as not yet filed',`This sets ${esc(fyDisplay(FY()))} back to "not yet filed". Any notice of assessment already attached is kept.`,'Mark as not yet filed',()=>{
    mytaxBucket().status='unfiled';save();render();toast('Status updated');
  });
}
function mytaxAttachOpen(){
  const mt=mytaxBucket();
  modal('Notice of assessment',`
    <div class="hint">Attach the ATO's notice of assessment once it arrives.</div>
    <div class="mt"><label class="fld">File ${mt.receiptId?'(replaces existing)':''}</label><input id="mt_rcpt2" type="file" class="input" accept="image/*,.pdf"></div>`,
    `<button class="btn" data-close>Cancel</button>${mt.receiptId?`<button class="btn ghost" onclick="mytaxDetachStatement()">Remove</button>`:''}<button class="btn primary" onclick="mytaxAttachSave()">Attach</button>`);
}
async function mytaxAttachSave(){
  const mt=mytaxBucket();
  const file=$('#mt_rcpt2')?.files[0];
  if(!file)return toast('Choose a file first');
  const oldRid=mt.receiptId;
  mt.receiptId=uid();mt.receiptName=file.name;
  closeModal();save();render();
  toast('Attaching…');
  try{
    await rcptPut({id:mt.receiptId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(FY()),category:'Notice of Assessment',date:mt.filedDate||todayISO(),itemName:'Notice of assessment',pid:isAll()?DB.people[0].id:DB.currentPid});
    if(oldRid&&!receiptStillReferenced(oldRid))await rcptDel(oldRid).catch(()=>{});
    toast('Notice of assessment attached');render();
  }catch(e){toast("Couldn't attach notice of assessment — try again");}
}
function mytaxDetachStatement(){
  const mt=mytaxBucket();
  if(mt.receiptId)rcptDel(mt.receiptId).catch(()=>{});
  mt.receiptId='';mt.receiptName='';
  closeModal();save();render();toast('Attachment removed');
}
function mytaxStatusCard(){
  const y=FY(),mt=mytaxBucket(),filed=mt.status==='filed';
  const s=filed?fySummaryNumbers(y,DB.currentPid):null;
  const ledgerBalance=s?s.balance:null;
  const atoAmt=mt.atoAmount||0;
  const atoSign=mt.atoOutcome==='owing'?-1:1;
  const atoBalance=atoAmt>0?atoAmt*atoSign:null;
  const discrepancy=atoBalance!=null&&ledgerBalance!=null?atoBalance-ledgerBalance:null;

  let filedDetail='';
  if(filed&&atoBalance!=null){
    const dir=atoSign>0?'Refund':'Owing';
    const discStr=discrepancy!=null&&Math.abs(discrepancy)>0.5
      ?`<span class="badge ${Math.abs(discrepancy)>100?'gold':'muted'}" style="font-size:.7rem">Δ ${fmt$(Math.abs(discrepancy))} ${discrepancy>0?'more refund':'less refund'} than estimated</span>`
      :`<span class="badge euc" style="font-size:.7rem">✓ Matches estimate</span>`;
    filedDetail=`<span class="muted" style="font-size:.86rem">ATO: <b style="color:${atoSign>0?'var(--euc)':'var(--red)'}">${dir} ${fmt$(atoAmt)}</b> · estimate was ${fmt$(Math.abs(ledgerBalance||0))} ${(ledgerBalance||0)>=0?'refund':'owing'}</span> ${discStr}`;
  }

  return `<div class="card" style="border-color:${filed?'var(--euc)':'var(--gold)'}"><div class="cbody" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="badge ${filed?'euc':'gold'}">${filed?'✓ Filed':'◌ Not yet filed'}</span>
      <span class="muted" style="font-size:.86rem">${filed?`Lodged ${mt.filedDate?fmtDate(mt.filedDate):'(no date set)'} for ${esc(fyDisplay(y))}`:`${esc(fyDisplay(y))} hasn't been marked as filed yet`}</span>
      ${filedDetail}
      ${mt.receiptId?`<span class="rcpt-file" style="font-size:.8rem" onclick="rcptView('${mt.receiptId}','Notice of assessment')">📎 ${esc(mt.receiptName||'Notice of assessment')}</span>`:''}
    </div>
    ${mt.notes?`<div class="muted" style="font-size:.82rem;width:100%;padding-top:2px">📝 ${esc(mt.notes)}</div>`:''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${filed
        ?`<button class="btn small" onclick="mytaxFiledOpen()">${atoBalance!=null?'Edit outcome':'+ Enter ATO outcome'}</button>
          <button class="btn small" onclick="mytaxAttachOpen()">${mt.receiptId?'Replace / remove':'+ Attach'} notice of assessment</button>
          <button class="btn ghost small" onclick="mytaxUnfile()">↺ Mark as not yet filed</button>`
        :`<button class="btn primary small" onclick="mytaxFiledOpen()">✓ Mark as filed</button>`}
    </div>
  </div></div>`;
}
// ═══════════════════════════════════════════════
// DOCUMENTS PAGE
// ═══════════════════════════════════════════════
let DOCS_FILTER='';
let DOCS_GROUP_COLLAPSED=new Set();
let DOCS_MISSING_EXPANDED=new Set();

// Category config — order, icon, label, nav target for "go attach" links
const DOC_CATS=[
  {key:'income',       label:'Income statements',            icon:'💰', page:'income'},
  {key:'dividends',    label:'Dividend statements',          icon:'📈', page:'dividends'},
  {key:'funds',        label:'Managed fund / AMIT statements',icon:'🏦', page:'funds'},
  {key:'property',     label:'Investment property receipts', icon:'🏠', page:'assets'},
  {key:'vehicle',      label:'Vehicle expense receipts',     icon:'🚗', page:'assets'},
  {key:'other',        label:'Other deduction receipts',     icon:'🗂️',  page:'other'},
  {key:'fbt',          label:'FBT statements',               icon:'📋', page:'mytax'},
  {key:'noa',          label:'Notices of assessment',        icon:'📜', page:'mytax'},
  {key:'statements',   label:'Balance statements',            icon:'🏛️', page:'networth'},
];

function fileIcon(name){
  if(!name)return '📎';
  const ext=(name.split('.').pop()||'').toLowerCase();
  if(ext==='pdf')return '📄';
  if(['jpg','jpeg','png','gif','webp','heic'].includes(ext))return '🖼️';
  return '📎';
}

// Build a rich per-category document structure for given years+pids
// Returns Map(catKey → {label, icon, page, docs:Map(receiptId→{id,name,items:[{desc,date,pid}]}), missing:[{desc,date,pid}]})
function docsCollect(years,pids){
  const cats=new Map(DOC_CATS.map(c=>[c.key,{...c,docs:new Map(),missing:[]}]));

  years.forEach(y=>{
    const fyLabel=fyDisplay(y);
    pids.forEach(pid=>{
      const b=bucket(y,pid);
      const p=DB.people.find(x=>x.id===pid)||{name:'?',color:'#888'};

      // Income statements
      (b.incomes||[]).forEach(r=>{
        const desc=esc(r.name||'Income')+(r.date?` · ${fmtDate(r.date)}`:'');
        const entry={desc,date:r.date||'',pid,fyLabel};
        if(r.receiptId){
          const cat=cats.get('income');
          if(!cat.docs.has(r.receiptId))cat.docs.set(r.receiptId,{id:r.receiptId,name:r.receiptName||'Income statement',items:[]});
          cat.docs.get(r.receiptId).items.push(entry);
        } else {
          cats.get('income').missing.push(entry);
        }
      });

      // Dividend statements
      (b.dividends||[]).forEach(d=>{
        const desc=esc(d.code||'Dividend')+(d.date?` · ${fmtDate(d.date)}`:'');
        const entry={desc,date:d.date||'',pid,fyLabel};
        if(d.receiptId){
          const cat=cats.get('dividends');
          if(!cat.docs.has(d.receiptId))cat.docs.set(d.receiptId,{id:d.receiptId,name:d.receiptName||'Dividend statement',items:[]});
          cat.docs.get(d.receiptId).items.push(entry);
        } else {
          cats.get('dividends').missing.push(entry);
        }
      });

      // Managed fund / AMIT statements
      (b.funds||[]).forEach(f=>{
        const desc=esc(f.code||'Fund')+(f.name?` — ${esc(f.name)}`:'');
        const entry={desc,date:'',pid,fyLabel};
        if(f.receiptId){
          const cat=cats.get('funds');
          if(!cat.docs.has(f.receiptId))cat.docs.set(f.receiptId,{id:f.receiptId,name:f.receiptName||'Fund statement',items:[]});
          cat.docs.get(f.receiptId).items.push(entry);
        } else {
          cats.get('funds').missing.push(entry);
        }
      });

      // Investment property & vehicle expenses
      (b.property?.expenses||[]).forEach(e=>{
        const asset=DB.assets?.find(a=>a.id===e.assetId);
        const isVeh=asset?.kind==='vehicle';
        const catKey=isVeh?'vehicle':'property';
        const assetName=asset?.name||'';
        const desc=(assetName?esc(assetName)+' — ':'')+esc(e.item||'Expense')+(e.date?` · ${fmtDate(e.date)}`:'');
        const entry={desc,date:e.date||'',pid,fyLabel};
        if(e.receiptId){
          const cat=cats.get(catKey);
          if(!cat.docs.has(e.receiptId))cat.docs.set(e.receiptId,{id:e.receiptId,name:e.receiptName||'Receipt',items:[]});
          cat.docs.get(e.receiptId).items.push(entry);
        } else {
          cats.get(catKey).missing.push(entry);
        }
      });

      // Other deductions
      (b.other||[]).forEach(e=>{
        const desc=esc(e.item||'Expense')+(e.date?` · ${fmtDate(e.date)}`:'');
        const entry={desc,date:e.date||'',pid,fyLabel};
        if(e.receiptId){
          const cat=cats.get('other');
          if(!cat.docs.has(e.receiptId))cat.docs.set(e.receiptId,{id:e.receiptId,name:e.receiptName||'Receipt',items:[]});
          cat.docs.get(e.receiptId).items.push(entry);
        } else {
          cats.get('other').missing.push(entry);
        }
      });

      // FBT statement (only if amount set)
      if(b.fbt?.amount>0){
        const entry={desc:`Reportable fringe benefits · ${esc(fyLabel)}`,date:'',pid,fyLabel};
        if(b.fbt.receiptId){
          const cat=cats.get('fbt');
          if(!cat.docs.has(b.fbt.receiptId))cat.docs.set(b.fbt.receiptId,{id:b.fbt.receiptId,name:b.fbt.receiptName||'FBT statement',items:[]});
          cat.docs.get(b.fbt.receiptId).items.push(entry);
        } else {
          cats.get('fbt').missing.push(entry);
        }
      }

      // Notice of assessment (only if filed)
      if(b.myTax?.status==='filed'){
        const entry={desc:`Notice of assessment · ${esc(fyLabel)}`,date:b.myTax.filedDate||'',pid,fyLabel};
        if(b.myTax.receiptId){
          const cat=cats.get('noa');
          if(!cat.docs.has(b.myTax.receiptId))cat.docs.set(b.myTax.receiptId,{id:b.myTax.receiptId,name:b.myTax.receiptName||'Notice of assessment',items:[]});
          cat.docs.get(b.myTax.receiptId).items.push(entry);
        } else {
          cats.get('noa').missing.push(entry);
        }
      }
    });
  });

  return cats;
}

// Collect NW balance statements (not FY-scoped — these live on DB.nw.entries globally)
// We inject these into the cats map after the FY/person loop above
function docsCollectStatements(cats,pids){
  const stmtCat=cats.get('statements');
  if(!stmtCat)return;
  const kindLabels={super:'Superannuation',savings:'Savings account',offset:'Offset account',liability:'Loan / liability'};
  (DB.nw?.entries||[]).forEach(e=>{
    if(!e.receiptId)return;
    const it=DB.nw.items.find(x=>x.id===e.itemId);
    if(!it)return;
    if(!['super','savings','offset','liability'].includes(it.kind))return;
    if(pids&&!pids.includes(it.pid))return;
    const kindLabel=kindLabels[it.kind]||it.kind;
    const stmtLabel=e.receiptStatementType==='yearly'?'Yearly statement':'Monthly statement';
    const desc=`${esc(it.name)} — ${stmtLabel}${e.date?` · ${fmtDate(e.date)}`:''}`;
    const docEntry={desc,date:e.date||'',pid:it.pid,fyLabel:kindLabel};
    if(!stmtCat.docs.has(e.receiptId))stmtCat.docs.set(e.receiptId,{id:e.receiptId,name:e.receiptName||'Statement',items:[]});
    stmtCat.docs.get(e.receiptId).items.push(docEntry);
  });
}

function docsResultsHTML(cats){
  const filter=DOCS_FILTER.toLowerCase();
  let html='';
  let rendered=0;

  cats.forEach((cat,key)=>{
    const allDocs=[...cat.docs.values()];
    const visibleDocs=filter?allDocs.filter(d=>
      d.name.toLowerCase().includes(filter)||
      cat.label.toLowerCase().includes(filter)||
      d.items.some(it=>it.desc.toLowerCase().includes(filter))
    ):allDocs;
    const visibleMissing=filter?cat.missing.filter(m=>m.desc.toLowerCase().includes(filter)):cat.missing;

    if(!visibleDocs.length&&!visibleMissing.length)return;
    rendered++;

    const collapsed=DOCS_GROUP_COLLAPSED.has(key)&&!filter;
    const missingExpanded=DOCS_MISSING_EXPANDED.has(key);
    const nDocs=visibleDocs.length;
    const nMiss=visibleMissing.length;
    const multiPerson=DB.people.length>1;

    // Build doc rows
    let docRowsHTML='';
    visibleDocs.forEach(doc=>{
      const icon=fileIcon(doc.name);
      // Roll-up description: list distinct item descs, cap at 3 then "+N more"
      const uniqueDescs=[...new Set(doc.items.map(i=>i.desc))];
      const subParts=uniqueDescs.slice(0,3);
      const overflow=uniqueDescs.length-3;
      let sub=subParts.join(' · ')+(overflow>0?` +${overflow} more`:'');
      // Person dots if household view
      const personDots=multiPerson?[...new Set(doc.items.map(i=>i.pid))].map(pid=>{
        const pp=DB.people.find(x=>x.id===pid);
        return pp?pdot(pp,10):'';
      }).join(''):'';
      // FY label if all-time view
      const fyTags=[...new Set(doc.items.map(i=>i.fyLabel))].join(', ');
      docRowsHTML+=`<div class="doc-row" onclick="rcptView('${doc.id}','${esc(doc.name).replace(/'/g,"\\'")}')">
        <div class="doc-icon">${icon}</div>
        <div style="flex:1;min-width:0">
          <div class="doc-name">${esc(doc.name)}</div>
          <div class="doc-sub">${sub}</div>
        </div>
        <div class="doc-meta">
          ${fyTags&&isAllFY()?`<span class="badge blue" style="font-size:.66rem">${esc(fyTags)}</span>`:''}
          <span style="display:flex;gap:3px">${personDots}</span>
        </div>
      </div>`;
    });

    // Missing section
    let missingHTML='';
    if(nMiss>0){
      missingHTML+=`<div class="doc-missing-head" onclick="docsMissingToggle('${key}')">
        <span style="font-size:.78rem;color:var(--gold);font-weight:700">⚠ ${nMiss} without attachment${nMiss>1?'s':''}</span>
        <span style="font-size:.75rem;color:var(--muted);flex:1">— click to ${missingExpanded?'hide':'review'}</span>
        <button class="btn small" onclick="event.stopPropagation();go('${cat.page}')">Go attach →</button>
      </div>`;
      if(missingExpanded){
        visibleMissing.forEach(m=>{
          const pp=multiPerson?DB.people.find(x=>x.id===m.pid):null;
          const personDot=pp?pdot(pp,10):'';
          missingHTML+=`<div class="doc-missing-row">
            <span style="font-size:.9rem;color:var(--muted)">◌</span>
            <div style="flex:1;min-width:0"><div class="doc-sub">${m.desc}</div></div>
            <span style="display:flex;gap:3px;align-items:center">${personDot}</span>
          </div>`;
        });
      }
    }

    html+=`<div class="doc-cat">
      <div class="doc-cat-head" onclick="docsGroupToggle('${key}')">
        <span style="font-size:1rem;margin-right:2px">${cat.icon}</span>
        <h2>${esc(cat.label)}</h2>
        <div class="doc-cat-badges">
          ${nDocs?`<span class="badge euc">✓ ${nDocs} doc${nDocs>1?'s':''}</span>`:''}
          ${nMiss?`<span class="badge gold">⚠ ${nMiss} missing</span>`:''}
        </div>
        <span style="margin-left:8px;color:var(--muted);font-size:.82rem">${collapsed?'▸':'▾'}</span>
      </div>
      <div class="doc-cat-body" style="${collapsed?'display:none':''}">
        ${docRowsHTML||`<div class="doc-empty">No documents attached yet — <span style="color:var(--euc);cursor:pointer" onclick="go('${cat.page}')">go to ${esc(cat.label.split(' ')[0].toLowerCase())} page to attach one</span>.</div>`}
        ${missingHTML}
      </div>
    </div>`;
  });

  if(!rendered){
    html=`<div class="card"><div class="cbody"><div class="muted" style="padding:10px 0">${filter?`No documents match "${esc(DOCS_FILTER)}".`:'No documents or trackable items found for this period.'}</div></div></div>`;
  }
  return html;
}

function docsGroupToggle(key){
  if(DOCS_GROUP_COLLAPSED.has(key))DOCS_GROUP_COLLAPSED.delete(key);else DOCS_GROUP_COLLAPSED.add(key);
  const el=document.getElementById('docsResults');
  if(el)el.innerHTML=_docsLastHTML();
}
function docsMissingToggle(key){
  if(DOCS_MISSING_EXPANDED.has(key))DOCS_MISSING_EXPANDED.delete(key);else DOCS_MISSING_EXPANDED.add(key);
  const el=document.getElementById('docsResults');
  if(el)el.innerHTML=_docsLastHTML();
}
let _docsCatsCache=null;
function _docsLastHTML(){return docsResultsHTML(_docsCatsCache||new Map());}
function docsCollapseAll(){DOC_CATS.forEach(c=>DOCS_GROUP_COLLAPSED.add(c.key));const el=document.getElementById('docsResults');if(el)el.innerHTML=_docsLastHTML();}
function docsExpandAll(){DOCS_GROUP_COLLAPSED.clear();const el=document.getElementById('docsResults');if(el)el.innerHTML=_docsLastHTML();}
function docsFilterInput(v){
  DOCS_FILTER=v;
  const el=document.getElementById('docsResults');
  if(el)el.innerHTML=_docsLastHTML();
}

PAGES.documents=m=>{
  // Determine which years and people to show
  const allYears=isAllFY()
    ?Object.values(DB.years).sort((a,b)=>fyOrderYear(b)-fyOrderYear(a))
    :[FY()];
  const pids=isAll()?DB.people.map(p=>p.id):[DB.currentPid];

  const cats=docsCollect(allYears,pids);
  docsCollectStatements(cats,pids);
  _docsCatsCache=cats;

  // Tally stats
  let totalDocs=0,totalMissing=0,catsWithDocs=0;
  cats.forEach(cat=>{
    if(cat.docs.size>0){totalDocs+=cat.docs.size;catsWithDocs++;}
    totalMissing+=cat.missing.length;
  });

  const fyLabel=isAllFY()?'All years':fyDisplay(FY());
  head(m,'Documents',`All attached statements and receipts${isAllFY()?', across all financial years':` for ${esc(fyLabel)}`}.`,
    `<button class="btn small" onclick="docsCollapseAll()">Collapse all</button>
     <button class="btn small" onclick="docsExpandAll()">Expand all</button>`);

  m.insertAdjacentHTML('beforeend',`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px">
      <div class="stat good"><div class="l">Documents attached</div><div class="v">${totalDocs}</div><div class="d">${catsWithDocs} categor${catsWithDocs===1?'y':'ies'}</div></div>
      <div class="stat gold"><div class="l">Missing attachments</div><div class="v">${totalMissing}</div><div class="d">items without a file</div></div>
      <div class="stat"><div class="l">Coverage</div><div class="v">${totalDocs+totalMissing>0?Math.round(totalDocs/(totalDocs+totalMissing)*100):0}%</div><div class="d">of trackable items</div></div>
    </div>
    <div class="docs-filter-row">
      <input class="input" type="search" placeholder="Filter by name or category…" value="${esc(DOCS_FILTER)}" oninput="docsFilterInput(this.value)">
    </div>
    <div id="docsResults">${docsResultsHTML(cats)}</div>
  `);
};

PAGES.mytax=m=>{
  const y=FY();
  if(isAll()){
    head(m,'myTax mapping',`myTax returns are lodged individually — pick a person above to see their reference summary.`,'');
    m.insertAdjacentHTML('beforeend','<div class="note">Switch from "⌂ Household" to a person using the switcher above.</div>');
    return;
  }
  const pid=DB.currentPid,b=PD();
  const bd=fyTaxableBreakdown(y,pid);
  head(m,'myTax mapping',`Reference summary for ${esc(fyDisplay(y))}, ordered and labelled the same way the ATO individual tax return / myTax is — work down it section by section while you fill in myTax.`,
    `<button class="btn" onclick="mytaxExpandAll();setTimeout(()=>window.print(),250)">Print / PDF</button>`);
  m.insertAdjacentHTML('beforeend',mytaxStatusCard());
  m.insertAdjacentHTML('beforeend',`<div class="card"><div class="cbody" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:200px">
      <b>PAYG instalments paid this year</b>
      <div class="muted" style="font-size:.84rem;margin-top:2px">A credit against tax owed, same as tax withheld — counted in your refund estimate below.</div>
    </div>
    <input class="input money" style="max-width:160px" value="${num(b.summaryOpts?.paygInstalments)||''}" placeholder="0.00"
      onchange="PD().summaryOpts=PD().summaryOpts||{};PD().summaryOpts.paygInstalments=num(this.value);save();render()">
  </div></div>`);
  m.insertAdjacentHTML('beforeend',fbtCard());
  m.insertAdjacentHTML('beforeend',`<div class="card" style="border-color:var(--gold)"><div class="cbody"><b>Reference only — not tax advice.</b> This is meant to speed up data entry into myTax, not replace it. Item and label numbers occasionally change between income years, and some items depend on your individual circumstances — always check against the current year's myTax form, and talk to a registered tax agent if you're unsure.</div></div>`);
  const row=(label,val,note)=>`<tr><td>${esc(label)}</td><td class="num">${fmt$(val)}</td><td class="muted" style="font-size:.78rem">${note||''}</td></tr>`;
  const sectionKeys=[];
  const section=(title,rowsHtml)=>{
    if(!rowsHtml)return'';
    const key=title;sectionKeys.push(key);
    const collapsed=MYTAX_COLLAPSED.has(key);
    return `<div class="card"><div class="chead" style="cursor:pointer" onclick="mytaxToggle('${esc(key).replace(/'/g,"\\'")}')"><h2><span style="display:inline-block;width:1em">${collapsed?'\u25B8':'\u25BE'}</span>${esc(title)}</h2></div><div class="cbody tight mytax-body" style="${collapsed?'display:none':''}"><table class="tbl"><tbody>${rowsHtml}</tbody></table></div></div>`;
  };
  // Per-fund AMIT-label rows + a combined total row, for whichever subset
  // of MFD_LABELS codes belongs to the return item being rendered (13, 18
  // or 20) — shared by those three sections below.
  const fundRowsFor=codes=>{
    let rows='';
    (b.funds||[]).forEach(f=>codes.forEach(code=>{
      const v=num(f.labels?.[code]);if(!v)return;
      const entry=MFD_LABELS.find(l=>l[0]===code);
      rows+=row(`${f.code} — ${code.replace(/^\d+/,'')}`,v,entry?entry[1]:'');
    }));
    return rows;
  };
  const fundTotalsFor=codes=>{
    let rows='';
    codes.forEach(code=>{
      const v=(b.funds||[]).reduce((s,f)=>s+num(f.labels?.[code]),0);
      if(!v)return;
      const entry=MFD_LABELS.find(l=>l[0]===code)||[,'',''];
      const tag=entry[2]==='memo'?' — memo only, already counted above':entry[2]==='offset'?' — flows through as a tax offset':entry[2]==='deduction'?' — flows through as a deduction':'';
      rows+=row(`${code.replace(/^\d+/,'')} — ${entry[1]}`,v,'sum across all funds'+tag);
    });
    return rows;
  };

  // Item 1 — Salary or wages (incl. bonuses, which usually flow through
  // the same payer/STP report as ordinary salary).
  let salRows='',salInc=0,salWh=0;
  ['Salary / wages','Bonus'].forEach(k=>{
    (b.incomes||[]).filter(r=>(r.kind||'Salary / wages')===k).forEach(r=>{
      if(!num(r.yearly)&&!num(r.taxWithheld))return;
      salRows+=row(`${r.name}${k==='Bonus'?' (bonus)':''}`,r.yearly,'');
      if(num(r.taxWithheld))salRows+=row(`${r.name} — tax withheld`,r.taxWithheld,'');
      salInc+=num(r.yearly);salWh+=num(r.taxWithheld);
    });
  });
  if(salRows)salRows+=row('Income — total',salInc,'sum of the above')+row('Tax withheld — total',salWh,"pre-filled by the ATO from your income statement — check it matches");

  // Item 2 — Allowances, earnings, tips, directors fees etc
  let allowRows='',allowTot=0;
  (b.incomes||[]).filter(r=>r.kind==='Allowance').forEach(r=>{
    if(!num(r.yearly))return;
    allowRows+=row(r.name,r.yearly,'');
    allowTot+=num(r.yearly);
  });
  if(allowRows)allowRows+=row('K — Item 2 total',allowTot,'copy this to Item 2 on your return');

  // Other income not covered by a specific item above (items 5/15/24).
  let otherIncRows='';
  ['Business / side income','Other'].forEach(k=>{
    (b.incomes||[]).filter(r=>(r.kind||'')===k).forEach(r=>{
      if(!num(r.yearly)&&!num(r.taxWithheld))return;
      otherIncRows+=row(r.name,r.yearly,INCOME_KIND_MYTAX[k]||'');
      if(num(r.taxWithheld))otherIncRows+=row(`${r.name} — tax withheld`,r.taxWithheld,'');
    });
  });

  // Item 10 — Gross interest (L — Gross interest, M — TFN amounts withheld)
  let intRows='',intTot=0,intWh=0;
  (b.incomes||[]).filter(r=>(r.kind||'')==='Bank interest').forEach(r=>{
    if(!num(r.yearly)&&!num(r.taxWithheld))return;
    intRows+=row(r.name||'Interest',r.yearly,'');
    intTot+=num(r.yearly);intWh+=num(r.taxWithheld);
  });
  if(intRows){
    intRows+=row('L — Gross interest',intTot,'sum of the above');
    if(intWh)intRows+=row('M — TFN amounts withheld',intWh,'');
  }

  // Item 11 — Dividends (S — Unfranked, T — Franked, U — Franking credit),
  // broken down per security so each holding's contribution is visible.
  const unfrkTot=(b.dividends||[]).reduce((s,d)=>s+num(d.unfranked),0);
  const frkTot=(b.dividends||[]).reduce((s,d)=>s+num(d.franked),0);
  let divRows='';
  if(unfrkTot||frkTot||bd.divCr){
    const divByCode={};
    (b.dividends||[]).forEach(d=>{
      const k=d.code||'Unknown';
      divByCode[k]=divByCode[k]||{unfranked:0,franked:0,credit:0};
      divByCode[k].unfranked+=num(d.unfranked);divByCode[k].franked+=num(d.franked);divByCode[k].credit+=num(d.frankingCredit);
    });
    Object.entries(divByCode).sort((a,b2)=>a[0]<b2[0]?-1:1).forEach(([code,v])=>{
      if(v.unfranked)divRows+=row(`${code} — Unfranked amount`,v.unfranked,'');
      if(v.franked)divRows+=row(`${code} — Franked amount`,v.franked,'');
      if(v.credit)divRows+=row(`${code} — Franking credit`,v.credit,'flows through as a tax offset');
    });
    divRows+=row('S — Unfranked amount',unfrkTot,'sum of the above')+row('T — Franked amount',frkTot,'sum of the above')+row('U — Franking credit',bd.divCr,'sum of the above — flows through as a tax offset');
  }

  // Item 13 — Partnerships and trusts (U, C, Y, Q — the 13-prefixed AMIT
  // labels from each ETF/managed fund's annual statement).
  // The ATO return itself shows "Net non-primary production amount" as the
  // headline combined figure (U + C − Y) rather than the three components
  // separately — compute and surface that explicitly so there's a single
  // number to copy into myTax, matching the structure of the real form.
  const fundL=(b.funds||[]).reduce((s,f)=>s+num(f.labels?.['13L']),0);
  const fundU=(b.funds||[]).reduce((s,f)=>s+num(f.labels?.['13U']),0);
  const fundC=(b.funds||[]).reduce((s,f)=>s+num(f.labels?.['13C']),0);
  const fundY=(b.funds||[]).reduce((s,f)=>s+num(f.labels?.['13Y']),0);
  const netNPP=fundU+fundC-fundY;
  let trustRows=fundRowsFor(FUND_ITEM_CODES[13])+fundTotalsFor(FUND_ITEM_CODES[13]);
  if(fundU||fundC||fundY){
    trustRows+=`<tr class="total"><td>Net non-primary production amount (U + C − Y)</td><td class="num">${fmt$(netNPP)}</td><td class="muted" style="font-size:.78rem">enter this combined figure on myTax — not U, C and Y separately</td></tr>`;
  }
  if(fundL){
    trustRows+=`<tr class="total"><td>Net primary production amount (L)</td><td class="num">${fmt$(fundL)}</td><td class="muted" style="font-size:.78rem">enter this on myTax — shown separately from non-primary production</td></tr>`;
  }

  // Item 18 — Capital gains (H, A) — cgtBreakdown() already pools share
  // sales together with fund/trust-distributed capital gains (18H/18A) and
  // applies current + prior year losses against the combined total, so
  // bd.cgt.grossGain/netCG are already the final combined myTax figures —
  // nothing further needs adding here.
  let cgRows='';
  const hadAnyCG=bd.cgt.grossGain||bd.cgt.netCG||bd.cgt.priorLosses;
  if(hadAnyCG){
    cgRows+=fundRowsFor(FUND_ITEM_CODES[18]);
    cgRows+=`<tr><td>Gross capital gain — share sales + funds/trusts, before losses/discount</td><td class="num">${fmt$(bd.cgt.grossGain)}</td><td class="muted" style="font-size:.78rem"></td></tr>`;
    if(bd.cgt.loss)cgRows+=`<tr><td>Current year capital losses applied</td><td class="num">−${fmt$(bd.cgt.loss)}</td><td class="muted" style="font-size:.78rem"></td></tr>`;
    if(bd.cgt.priorLosses)cgRows+=`<tr><td>Prior year net capital losses applied</td><td class="num">−${fmt$(bd.cgt.priorLosses-bd.cgt.lossesCarriedForward)}</td><td class="muted" style="font-size:.78rem">of ${fmt$(bd.cgt.priorLosses)} available</td></tr>`;
    cgRows+=`<tr class="total"><td>H — Total current year capital gains (combined)</td><td class="num">${fmt$(bd.cgt.grossGain)}</td><td class="muted" style="font-size:.78rem">shares + funds/trusts — enter this on myTax</td></tr>`
      +`<tr class="total"><td>A — Net capital gain (combined)</td><td class="num">${fmt$(bd.cgt.netCG)}</td><td class="muted" style="font-size:.78rem">shares + funds/trusts — enter this on myTax</td></tr>`;
    if(bd.cgt.lossesCarriedForward)cgRows+=`<tr><td>Net capital losses carried forward to later years</td><td class="num">${fmt$(bd.cgt.lossesCarriedForward)}</td><td class="muted" style="font-size:.78rem">V — carries forward to next FY's "prior losses" field</td></tr>`;
  }

  // Item 20 — Foreign source income and foreign assets or property
  // (E, M, F, O — the 20-prefixed AMIT labels).
  const foreignRows=fundRowsFor(FUND_ITEM_CODES[20])+fundTotalsFor(FUND_ITEM_CODES[20]);

  // Item 21 — Rent (P — Gross rent, Q — Interest, F — Capital works,
  // U — Other rental deductions), combining manually-entered rental
  // income with auto-calculated rental from property assets.
  const rentExtra=bd.rentalIncome;
  let rentRows='';
  if(rentExtra||bd.prop||bd.depreciation||bd.costSpread){
    const myProps=assetsForPerson([pid]).filter(a=>a.kind==='property'&&a.investment!==false);
    const interestTot=myProps.reduce((s,a)=>{const B2=bucket(y,pid);return s+assetExpensesOf(B2,a).filter(e=>e.category==='Interest').reduce((s2,e)=>s2+propExpDeductibleEffective(e,B2,pid),0);},0);
    const otherRentalDed=Math.max(0,bd.prop-interestTot)+(bd.costSpread||0);
    if(rentExtra)rentRows+=row('P — Gross rent',rentExtra,'');
    if(interestTot)rentRows+=row('Q — Interest deductions',interestTot,'');
    if(bd.depreciation)rentRows+=row('F — Capital works deductions',bd.depreciation,'building/plant depreciation');
    if(otherRentalDed){
      // Build a per-property breakdown for U
      const uKey='Item 21 — U breakdown';
      const uCollapsed=MYTAX_COLLAPSED.has(uKey);
      let uDetailRows='';
      myProps.forEach(a=>{
        const B2=bucket(y,pid);
        const cashDed=assetExpensesOf(B2,a).filter(e=>e.category!=='Interest').reduce((s,e)=>s+propExpDeductibleEffective(e,B2,pid),0);
        const mgmt=managementFeeForFY(a,y);
        const spread=costScheduleForFY(a,y);
        if(cashDed)uDetailRows+=`<tr><td colspan="2" style="padding-left:24px;font-size:.82rem;color:var(--muted)">${esc(a.name)} — cash expenses (rates, insurance, repairs…)</td><td class="num" style="font-size:.82rem">${fmt$(cashDed)}</td></tr>`;
        if(mgmt)uDetailRows+=`<tr><td colspan="2" style="padding-left:24px;font-size:.82rem;color:var(--muted)">${esc(a.name)} — management fee</td><td class="num" style="font-size:.82rem">${fmt$(mgmt)}</td></tr>`;
        if(spread)uDetailRows+=`<tr><td colspan="2" style="padding-left:24px;font-size:.82rem;color:var(--muted)">${esc(a.name)} — borrowing cost spread</td><td class="num" style="font-size:.82rem">${fmt$(spread)}</td></tr>`;
      });
      rentRows+=`<tr style="cursor:pointer" onclick="mytaxToggle('${uKey}')">
        <td>U — Other rental deductions <span style="font-size:.7rem;color:var(--muted)">${uCollapsed?'▸ expand':'▾ hide'}</span></td>
        <td class="num">${fmt$(otherRentalDed)}</td>
        <td class="muted" style="font-size:.78rem">rates, insurance, agent fees, repairs, borrowing expenses — <a href="#" onclick="event.stopPropagation();go('assets');return false" style="color:var(--euc)">see Assets</a></td></tr>`;
      if(!uCollapsed&&uDetailRows)rentRows+=uDetailRows;
    }
    if(rentRows){
      const netRent=rentExtra-(interestTot+(bd.depreciation||0)+otherRentalDed);
      rentRows+=row('Net rent (P less Q+F+U)',netRent,'');
      if(netRent<0)rentRows+=row('IT6 — Net rental property loss',-netRent,'enter as a positive amount under Income tests');
    }
  }

  // D1–D15 — work-related and other deductions, grouped into one card per
  // D-item (the return's own grouping) instead of one flat list.
  const dedGroups={};
  const dedAdd=(itemCode,title,label,amount,note)=>{
    if(!amount)return;
    const g=dedGroups[itemCode]||(dedGroups[itemCode]={title,rowsHtml:'',total:0});
    g.rowsHtml+=row(label,amount,note);g.total+=amount;
  };
  if(bd.wfh.claim)dedAdd('D5','D5 — Other work-related expenses','Working from home (fixed-rate method)',bd.wfh.claim,'see WFH tracker');
  if(bd.dev)dedAdd('D5','D5 — Other work-related expenses','Decline in value of work-related devices',bd.dev,'see Other deductions → Devices');
  // Other deductions from the Deductions page
  (b.other||[]).forEach(e=>{
    const v=num(e.amount);if(!v)return;
    const map=OTH_DED_MYTAX_ITEM[e.type]||{item:'D5',title:'D5 — Other work-related expenses'};
    dedAdd(map.item,map.title,e.item||e.type||'Deduction',v,e.type||'');
  });
  // Deductible expenses from the Expenses page (non-property linked, e.g. self-education, tax agent)
  (b.expenses||[]).filter(e=>!e.assetId&&expDeductibleAmt(e)>0).forEach(e=>{
    const v=yearlyFromRec(expDeductibleAmt(e),e.recurrence);if(!v)return;
    // Use explicit dedItem if set, otherwise infer from category
    let map;
    if(e.dedItem){
      const title={D1:'D1 — Work-related car expenses',D2:'D2 — Work-related travel expenses',D3:'D3 — Work-related clothing, laundry and dry-cleaning expenses',D4:'D4 — Work-related self-education expenses',D5:'D5 — Other work-related expenses',D9:'D9 — Gifts or donations',D10:'D10 — Cost of managing tax affairs',D12:'D12 — Personal superannuation contributions',D15:'D15 — Other deductions'}[e.dedItem]||e.dedItem;
      map={item:e.dedItem,title};
    }else{
      const cat=e.category||'Other work-related expenses';
      map=OTH_DED_MYTAX_ITEM[cat]||{item:'D5',title:'D5 — Other work-related expenses'};
    }
    dedAdd(map.item,map.title,esc(e.name||e.category||'Expense'),v,'from Expenses page');
  });
  let dedSectionsHtml='';
  D_ORDER.forEach(code=>{
    const g=dedGroups[code];if(!g)return;
    const letter=D_LETTER[code];
    const rowsHtml=g.rowsHtml+row(`${code} total${letter?' — '+letter:''}`,g.total,letter?'enter on myTax':"check the exact field letter on myTax — varies by item");
    dedSectionsHtml+=section(g.title,rowsHtml);
  });

  // Tax offsets — myTax calculates this automatically from items 11/13/20
  // above, nothing extra needs typing in, but useful as a running total.
  const offsetTotal=bd.divCr+bd.fundOffsets;
  const offsetRows=offsetTotal?row('Total tax offsets',offsetTotal,'from item 11 (U), item 13 (Q) and item 20 (O) above — myTax works this out for you'):'';

  const sectionsHtml=section('Item 1 — Salary or wages',salRows)
    +section('Item 2 — Allowances, earnings, tips, directors fees',allowRows)
    +section('Other income (items 5, 15 & 24)',otherIncRows)
    +section('Item 10 — Gross interest',intRows)
    +section('Item 11 — Dividends',divRows)
    +section('Item 13 — Partnerships and trusts',trustRows)
    +section('Item 18 — Capital gains',cgRows)
    +section('Item 20 — Foreign source income and foreign assets or property',foreignRows)
    +section('Item 21 — Rent',rentRows)
    +dedSectionsHtml
    +section('Tax offsets',offsetRows);
  m.insertAdjacentHTML('beforeend',
    (sectionKeys.length?`<div style="margin-bottom:10px"><button class="btn ghost small" onclick='mytaxCollapseAll(${JSON.stringify(sectionKeys)})'>Collapse all</button> <button class="btn ghost small" onclick="mytaxExpandAll()">Expand all</button></div>`:'')
    +sectionsHtml
    +(bd.preTaxTotal?`<div class="card"><div class="cbody"><b>Pre-tax deductions:</b> ${fmt$(bd.preTaxTotal)} for ${esc(fyDisplay(y))}. These reduce taxable income directly and are already excluded from the income figures above (reported via your employer's STP) — they generally aren't entered separately in myTax, unless any of this is a <b>personal deductible super contribution</b> (item D12), which your super fund needs a separate notice for.</div></div>`:'')
    +`<div class="card"><div class="chead"><h2>Other return items</h2></div><div class="cbody">
      <p class="muted" style="margin-bottom:8px;font-size:.86rem">These appear on the ATO return — check your myTax pre-fill and payment summaries directly:</p>
      <ul style="margin-left:18px;line-height:1.7;font-size:.86rem">
      <li><b>IT2</b> — Reportable employer superannuation contributions</li>
      <li><b>IT3 / IT4</b> — Tax-free government pensions / target foreign income</li>
      <li><b>IT5</b> — Net financial investment loss</li>
      <li><b>IT7 / IT8</b> — Child support paid / number of dependent children</li>
      <li><b>M1</b> — Medicare levy reduction or exemption</li>
      <li><b>M2</b> — Medicare levy surcharge (private hospital cover)</li>
      </ul>
    </div></div>`
  );
};
PAGES.trends=m=>{
  const pids=isAll()?DB.people.map(p=>p.id):[DB.currentPid];
  const years=Object.values(DB.years).sort((a,b)=>fyOrderYear(a)-fyOrderYear(b));
  head(m,isAll()?'Household trends':'Trends','Year-over-year view across all your financial years. Click any bar to jump to that FY.','');
  const today=todayISO();
  const rows=years.map(y=>{
    let assessable=0,deductions=0,taxable=0,taxTotal=0,divPay=0,divCr=0,nw=0,fundIncome=0,rentalIncome=0;
    pids.forEach(pid=>{
      const s=fySummaryNumbers(y,pid);
      const b=bucket(y,pid);
      assessable+=s.assessable;deductions+=s.deductions;taxable+=s.taxable;taxTotal+=s.tax.total;divCr+=s.divCr;
      divPay+=b.dividends.reduce((s2,d)=>s2+num(d.payment),0);
      const{assess:fa}=fundLabelTotals(b);
      fundIncome+=fa;
      rentalIncome+=assetsForPerson([pid]).filter(a=>a.kind==='property'&&a.rental?.history?.length)
        .reduce((s2,a)=>s2+rentalIncomeEffective(a,y),0);
    });
    const end=fyRange(y).end;
    const cutoff=end<today?end:today;
    nwItemsFor(pids).forEach(it=>{const v=nwValueAt(it.id,cutoff);if(v!=null)nw+=v;});
    let expenses=0;
    pids.forEach(pid=>{
      const b=bucket(y,pid);
      expenses+=(b.expenses||[]).reduce((s,e)=>s+yearlyFromRec(num(e.amount),e.recurrence),0);
      expenses+=(b.property?.expenses||[]).reduce((s,e)=>s+num(e.amount),0);
    });
    const totalIncome=assessable;
    const effRate=assessable>0?taxTotal/assessable*100:0;
    return {y,label:fyDisplay(y),totalIncome,deductions,assessable,taxable,taxTotal,effRate,expenses,nw,divPay,divCr,fundIncome,rentalIncome};
  });
  if(!rows.length){m.insertAdjacentHTML('beforeend','<div class="note">No financial years yet.</div>');return;}

  // Chart builder — compact, bars clickable to switch FY and go to dashboard
  const trendChart=(data,opts={})=>barChartSVGClickable(
    data.map(r=>({label:r.label,value:r.value,onClick:`trendGoFY(${fyOrderYear(r.y)})`})),
    {aria:opts.aria,color:opts.color,compact:true}
  );
  // Wrap chart in a compact card
  const trendCard=(title,hint,data,color)=>`<div class="card"><div class="chead" style="padding-bottom:8px"><h2 style="font-size:.92rem">${title}</h2>${hint?`<span class="hint" style="font-size:.74rem">${hint}</span>`:''}</div><div class="cbody" style="padding-top:0">${trendChart(data,{color})}</div></div>`;

  // 2-col grid for compactness
  m.insertAdjacentHTML('beforeend',`
    <div class="note" style="margin-bottom:14px">Click any bar to jump to that FY's dashboard.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${trendCard('Total income','assessable income — salary, dividends, rent, capital gains & franking credits',rows,'var(--euc)')}
      ${trendCard('Deductions claimed','WFH, property, devices & other',rows.map(r=>({...r,value:r.deductions})),'var(--red)')}
      ${trendCard('Tax payable','estimate using frozen rate snapshot',rows.map(r=>({...r,value:r.taxTotal})),'var(--red)')}
      ${trendCard('Effective tax rate','tax ÷ assessable income',rows.map(r=>({...r,value:r.effRate})),'var(--orange)')}
      ${trendCard('Dividend income','cash dividends received (excl. franking)',rows.map(r=>({...r,value:r.divPay})),'var(--blue)')}
      ${trendCard('Franking credits grossed up','included in assessable income',rows.map(r=>({...r,value:r.divCr})),'var(--blue)')}
      ${rows.some(r=>r.fundIncome)? trendCard('Managed fund income','AMIT assessable labels (13L/U/C, 18A, 20E/F)',rows.map(r=>({...r,value:r.fundIncome})),'var(--purple)'):''}
      ${rows.some(r=>r.rentalIncome)?trendCard('Rental income','from investment properties',rows.map(r=>({...r,value:r.rentalIncome})),'var(--gold)'):''}
      ${trendCard('Expenses','actual cash spent — not just deductible',rows.map(r=>({...r,value:r.expenses})),'var(--orange)')}
      ${trendCard('Net worth','end of each FY (or today for current)',rows.map(r=>({...r,value:r.nw})),'')}
    </div>
  `);

  m.insertAdjacentHTML('beforeend',`
  <div class="card" style="margin-top:14px"><div class="chead"><h2>Year by year</h2></div>
  <div class="note" style="margin:0 14px 10px">Assessable income includes grossed-up franking credits. Click a row to jump to that FY.</div>
  <div class="cbody tight" style="overflow-x:auto"><table class="tbl" style="min-width:1100px">
    <thead><tr><th>FY</th><th class="num">Assessable income</th><th class="num">Dividends</th><th class="num">Deductions</th><th class="num">Taxable</th><th class="num">Tax payable</th><th class="num">Eff. rate</th><th class="num">Expenses</th><th class="num">Net worth</th></tr></thead>
    <tbody>${rows.map(r=>`<tr style="cursor:pointer" onclick="trendGoFY(${fyOrderYear(r.y)})">
      <td>${esc(r.label)}${r.y.locked?' 🔒':''}</td>
      <td class="num">${fmt$0(r.assessable)}</td>
      <td class="num">${fmt$0(r.divPay)}</td>
      <td class="num">${fmt$0(r.deductions)}</td>
      <td class="num">${fmt$0(r.taxable)}</td>
      <td class="num">${fmt$0(r.taxTotal)}</td>
      <td class="num">${r.effRate.toFixed(1)}%</td>
      <td class="num">${fmt$0(r.expenses)}</td>
      <td class="num">${fmt$0(r.nw)}</td></tr>`).join('')}</tbody>
  </table></div></div>
  <div class="note">Figures use each FY's frozen rate snapshot where locked, and current settings for unlocked years.</div>`);
};
function trendGoFY(orderYear){
  // Find the FY matching this order year and switch to it, then go to dashboard
  const y=Object.values(DB.years).find(y=>fyOrderYear(y)===orderYear);
  if(!y)return;
  DB.currentFY=y.startYear;
  initFYSelect();
  go('dashboard');
}
let SUMMARY_OPEN=new Set(); // keys of expanded rows in FY summary, transient
function summaryToggle(key){if(SUMMARY_OPEN.has(key))SUMMARY_OPEN.delete(key);else SUMMARY_OPEN.add(key);render();}

PAGES.summary=m=>{
  const y=FY();
  if(isAll())return summaryHousehold(m,y);
  const pid=DB.currentPid,b=PD();
  const R=y.rates,s=fySummaryNumbers(y,pid),o=b.summaryOpts;
  head(m,'FY summary',`Everything for ${esc(y.label)} in one statement, computed with that year's frozen rate snapshot.`,
    `<button class="btn" onclick="mytaxExpandAll();setTimeout(()=>window.print(),250)">Print / PDF</button>`);

  // ── Detect ETF/fund double-counting ──
  const fundCodes=new Set(b.funds.filter(f=>f.code&&Object.values(f.labels||{}).some(v=>num(v)>0)).map(f=>f.code.toUpperCase()));
  const divCodesInFunds=[...new Set(b.dividends.map(d=>(d.code||'').toUpperCase()))].filter(c=>c&&fundCodes.has(c));
  if(divCodesInFunds.length){
    m.insertAdjacentHTML('beforeend',`<div class="card" style="border-color:var(--red);margin-bottom:16px"><div class="cbody" style="display:flex;gap:12px;align-items:flex-start">
      <span style="font-size:1.3rem">&#x26A0;&#xFE0F;</span>
      <div>
        <b style="color:var(--red)">Assessable income may be overstated &#x2014; possible ETF double-count</b>
        <div class="mt" style="font-size:.88rem">The code${divCodesInFunds.length>1?'s':''} <b style="color:var(--red)">${divCodesInFunds.join(', ')}</b> appear${divCodesInFunds.length===1?'s':''} in both <b>Share Dividends</b> and <b>ETF / Managed Funds</b> with label amounts.</div>
        <div class="mt" style="font-size:.85rem">If ${divCodesInFunds.join('/')} ${divCodesInFunds.length>1?'are':'is'} a managed fund or ETF, distributions should only be entered via the ETF/Managed Funds AMIT import &#x2014; not also as share dividends. Having both causes the same income to count twice in assessable income.</div>
        <div class="mt" style="font-size:.85rem"><b>Fix:</b> Go to <a href="#" onclick="go('dividends');return false" style="color:var(--euc)">Share Dividends</a> and remove entries for ${divCodesInFunds.join(', ')}, then confirm the AMIT amounts on the <a href="#" onclick="go('funds');return false" style="color:var(--euc)">ETF / Managed Funds</a> page are correct.</div>
      </div></div></div>`);
  }

  // ── Detect Other Deductions / Expenses page double-count ──
  // A coincidental exact-dollar match between an "Other deduction" entry and
  // a deductible "Expense" entry is a strong signal the same item was entered
  // twice in two different places (e.g. a donation logged both as an Other
  // Deduction AND as a deductible Expense), inflating total deductions.
  const otherAmts=(b.other||[]).filter(e=>num(e.amount)>0);
  const expAmts=(b.expenses||[]).filter(e=>!e.assetId&&expDeductibleAmt(e)>0);
  const dupPairs=[];
  otherAmts.forEach(o=>{
    expAmts.forEach(e=>{
      if(Math.abs(num(o.amount)-yearlyFromRec(expDeductibleAmt(e),e.recurrence))<0.01){
        dupPairs.push({otherItem:o.item,expName:e.name||e.category,amount:num(o.amount)});
      }
    });
  });
  if(dupPairs.length){
    m.insertAdjacentHTML('beforeend',`<div class="card" style="border-color:var(--gold);margin-bottom:16px"><div class="cbody" style="display:flex;gap:12px;align-items:flex-start">
      <span style="font-size:1.3rem">&#x26A0;&#xFE0F;</span>
      <div>
        <b style="color:var(--gold)">Possible duplicate deduction</b>
        <div class="mt" style="font-size:.88rem">The same dollar amount appears in both <b>Other Deductions</b> and the <b>Expenses page</b> — likely the same item entered twice:</div>
        <ul style="margin:8px 0 0 18px;font-size:.85rem">${dupPairs.map(p=>`<li><b>${fmt$(p.amount)}</b> — "${esc(p.otherItem)}" (Other Deductions) and "${esc(p.expName)}" (Expenses)</li>`).join('')}</ul>
        <div class="mt" style="font-size:.85rem"><b>Fix:</b> If these are the same expense, remove it from one place — keep it in <a href="#" onclick="go('expenses');return false" style="color:var(--euc)">Expenses</a> if you want a receipt attached, or in <a href="#" onclick="go('other');return false" style="color:var(--euc)">Other Deductions</a> otherwise, not both.</div>
      </div></div></div>`);
  }

  // ── Helper: a collapsible line with optional sub-rows ──
  // mainRow: {label, value, color?}
  // subRows: [{label, value, color?, indent?}] — shown when expanded
  const expandLine=(key,label,value,subRows,opts={})=>{
    const open=SUMMARY_OPEN.has(key);
    const hasItems=subRows&&subRows.length>0;
    const chevron=hasItems?`<span style="margin-left:6px;font-size:.7rem;color:var(--muted)">${open?'▲':'▼'}</span>`:'';
    const rowStyle=hasItems?'cursor:pointer;user-select:none':'';
    const main=`<div class="kv ${opts.big?'big':''}" style="${rowStyle}" onclick="${hasItems?`summaryToggle('${key}')`:''}">`+
      `<span class="k">${label}${chevron}</span>`+
      `<span class="v" style="${opts.c||''}">${fmt$(value)}</span>`+
      `</div>`;
    if(!open||!hasItems)return main;
    const subs=subRows.map(r=>
      `<div class="kv" style="padding-left:${r.indent!==false?'18px':'0'};font-size:.84rem;opacity:.9">`+
      `<span class="k" style="color:var(--muted)">${r.label}</span>`+
      `<span class="v" style="${r.c||''}">${fmt$(r.value)}</span>`+
      `</div>`
    ).join('');
    return main+`<div style="background:var(--surface2);border-radius:var(--radius-sm);margin:2px 0 6px;padding:4px 0">${subs}</div>`;
  };

  // ── Build sub-rows for each section ──

  // Salary & other income
  const incomeSubs=b.incomes.map(r=>({label:esc(r.name)+` <span class="muted" style="font-size:.76rem">(${esc(r.kind||'salary')})</span>`,value:num(r.yearly)}));

  // Dividends
  const divGroups={};b.dividends.forEach(d=>{(divGroups[d.code]=divGroups[d.code]||[]).push(d);});
  const divSubs=Object.entries(divGroups).sort(([a],[b2])=>a<b2?-1:1).map(([code,ds])=>{
    const pay=ds.reduce((s,d)=>s+num(d.payment),0);
    const cr=ds.reduce((s,d)=>s+num(d.frankingCredit),0);
    return {label:`${esc(code)} — ${ds.length} payment${ds.length>1?'s':''}, franking ${fmt$(cr)}`,value:pay};
  });

  // Franking credits — same grouping
  const crSubs=Object.entries(divGroups).sort(([a],[b2])=>a<b2?-1:1)
    .filter(([,ds])=>ds.reduce((s,d)=>s+num(d.frankingCredit),0)>0)
    .map(([code,ds])=>({label:`${esc(code)} franking credits`,value:ds.reduce((s,d)=>s+num(d.frankingCredit),0)}));

  // Managed fund income — per fund and per label group
  const fundSubs=[];
  const L=k2=>b.funds.reduce((s,f)=>s+num(f.labels?.[k2]),0);
  const labelGroups=[['Income labels (13L/U/C, 18A, 20E/F)',['13L','13U','13C','18A','20E','20F']],['Offsets (13Q, 20O)',['13Q','20O']],['Deductions (13Y)',['13Y']]];
  b.funds.filter(f=>Object.values(f.labels||{}).some(v=>num(v)>0)).forEach(f=>{
    const total=Object.entries(f.labels||{}).reduce((s,[k,v])=>s+num(v),0);
    if(total)fundSubs.push({label:`${esc(f.code)} — ${esc(f.name||'')}`,value:['13L','13U','13C','20E','20F'].reduce((s,k)=>s+num(f.labels?.[k]),0)});
  });
  // Note: fundPayments (cash distributions) are NOT part of fundAssess / assessable income.
  // They're recorded for cashflow purposes only. Showing them here would make the
  // sub-rows add up to more than the assessable total, which would confuse the user.

  // Capital gains (share sales + fund/trust distributions, pooled)
  const cgSubs=[];
  if(s.cgt){
    const c=s.cgt;
    if(c.grossGain)cgSubs.push({label:'Total capital gains (shares + funds, before losses/discount)',value:c.grossGain});
    if(c.loss)cgSubs.push({label:'Current year capital losses applied',value:-c.loss,c:'color:var(--red)'});
    if(c.priorLosses)cgSubs.push({label:`Prior year losses applied (of ${fmt$(c.priorLosses)} available)`,value:-(c.priorLosses-c.lossesCarriedForward),c:'color:var(--red)'});
    if(c.discountAfterLoss)cgSubs.push({label:'50% CGT discount on eligible gains',value:-c.discountAfterLoss*0.5,c:'color:var(--euc)'});
    cgSubs.push({label:'Net capital gain',value:s.netCG,c:'color:var(--euc)',indent:false});
  }

  // Rental income — per property
  const rentSubs=assetsForPerson([pid]).filter(a=>a.kind==='property'&&a.rental?.history?.length)
    .map(a=>({label:esc(a.name),value:rentalIncomeEffective(a,y)}));

  // WFH
  const wfhSubs=[
    {label:`${s.wfh.days} WFH days × ${s.wfh.hpd}h × $${(R.wfh.ratePerHour).toFixed(2)}/hr`,value:s.wfh.claim},
  ];

  // Investment property deductions
  const propSubs=[];
  const propAssets=assetsForPerson([pid]).filter(a=>a.kind==='property');
  propAssets.forEach(a=>{
    const B2=bucket(y,pid);
    const cashDed=assetExpensesOf(B2,a).reduce((s,e)=>s+propExpDeductibleEffective(e,B2,pid),0);
    const mgmt=managementFeeForFY(a,y);
    const dep=depreciationForFY(a,y);
    const spread=costScheduleForFY(a,y);
    if(cashDed)propSubs.push({label:`${esc(a.name)} — cash expenses`,value:cashDed});
    if(mgmt)propSubs.push({label:`${esc(a.name)} — management fee`,value:mgmt});
    if(dep)propSubs.push({label:`${esc(a.name)} — depreciation`,value:dep});
    if(spread)propSubs.push({label:`${esc(a.name)} — borrowing cost spread`,value:spread});
  });
  // expenses-page deductible expenses are shown in their own line below
  // (not folded into propSubs — they aren't property-related, and folding
  // them in without updating the parent row's total made the sub-rows sum
  // to more than the displayed parent value).

  // Work devices
  const devSubs=[];
  Object.values(DB.years).forEach(fy=>bucket(fy,pid).devices.forEach(d=>{
    const ded=deviceDeductionForFY(d,y);
    if(ded)devSubs.push({label:esc(d.name)+` (${esc(fy.label)})`,value:ded});
  }));

  // Other deductions
  const othSubs=b.other.filter(e=>num(e.amount)>0).map(e=>({label:esc(e.item),value:num(e.amount)}));

  // Deductible expenses from the Expenses page (non-property-linked — property-
  // linked ones are already shown above via propSubs, synced from expSyncPropExpense)
  const expDedSubs=(b.expenses||[]).filter(e=>!e.assetId&&expDeductibleAmt(e)>0)
    .map(e=>({label:esc(e.name||e.category||'Expense')+(e.dedItem?` <span class="muted" style="font-size:.76rem">(${esc(e.dedItem)})</span>`:''),value:yearlyFromRec(expDeductibleAmt(e),e.recurrence)}));

  // Fund deductions (13Y)
  const fundDedSubs=b.funds.filter(f=>num(f.labels?.['13Y'])>0).map(f=>({label:`${esc(f.code)} (13Y)`,value:num(f.labels['13Y'])}));

  // Pre-tax deductions
  const preTaxSubs=(b.preTaxDeds||[]).filter(r=>num(r.yearly)>0).map(r=>({label:esc(r.name)+` (${esc(r.type)})`,value:num(r.yearly)}));

  m.insertAdjacentHTML('beforeend',`
  <div class="grid2">
    <div>
      <div class="card"><div class="chead"><h2>Assessable income</h2><span class="hint" style="font-size:.76rem">click a row to expand</span></div><div class="cbody">
        ${expandLine('inc',`Salary & other income`,s.incomes,incomeSubs)}
        ${expandLine('div','Dividends received',s.divPay,divSubs)}
        ${expandLine('cr','Franking credits (grossed up)',s.divCr,crSubs)}
        ${s.fundAssess?expandLine('fund','Managed fund income (13L, 13U, 13C, 20E, 20F — 18A is in Net capital gain below)',s.fundAssess,fundSubs):''}
        ${s.netCG?expandLine('cg','Net capital gain (shares + funds/trusts)',s.netCG,cgSubs):''}
        ${s.rentalIncome?expandLine('rent','Rental income',s.rentalIncome,rentSubs):''}
        <div class="kv big" style="border-top:3px double var(--line2);margin-top:4px;padding-top:8px"><span class="k">Total assessable income</span><span class="v">${fmt$(s.assessable)}</span></div>
      </div></div>

      <div class="card"><div class="chead"><h2>Deductions</h2><span class="hint" style="font-size:.76rem">click a row to expand</span></div><div class="cbody">
        ${expandLine('wfh',`WFH fixed rate — ${s.wfh.days} days × ${s.wfh.hpd}h × ${(R.wfh.ratePerHour*100).toFixed(0)}c`,-s.wfh.claim,wfhSubs.map(r=>({...r,value:-r.value})))}
        ${expandLine('prop','Investment property',-s.prop-s.mgmtFee-s.depreciation-s.costSpread,propSubs.map(r=>({...r,value:-r.value})))}
        ${s.dev?expandLine('dev','Work devices (decline in value / immediate)',-s.dev,devSubs.map(r=>({...r,value:-r.value}))):''}
        ${s.other?expandLine('oth','Other deductions',-s.other,othSubs.map(r=>({...r,value:-r.value}))):''}
        ${s.expDed?expandLine('expded','Deductible expenses (Expenses page)',-s.expDed,expDedSubs.map(r=>({...r,value:-r.value}))):''}
        ${s.fundDed?expandLine('fd','Fund deductions (13Y)',-s.fundDed,fundDedSubs.map(r=>({...r,value:-r.value}))):''}
        <div class="kv big" style="border-top:3px double var(--line2);margin-top:4px;padding-top:8px;color:var(--red)"><span class="k">Total deductions</span><span class="v">${fmt$(-s.deductions)}</span></div>
      </div></div>
    </div>
    <div>
      <div class="card"><div class="chead"><h2>Tax position</h2></div><div class="cbody">
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:.84rem">
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${o.mls?'checked':''} onchange="PD().summaryOpts.mls=this.checked;save();render()">MLS applies</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${o.hasCover?'checked':''} onchange="PD().summaryOpts.hasCover=this.checked;save();render()">Private hospital cover</label>
        </div>
        ${s.preTaxTotal?expandLine('ptd','Pre-tax deductions (salary sacrifice)',-s.preTaxTotal,preTaxSubs.map(r=>({...r,value:-r.value}))):''}
        <div class="kv big"><span class="k">Taxable income</span><span class="v">${fmt$(s.taxable)}</span></div>
        <div class="kv"><span class="k">Income tax on taxable income</span><span class="v">${fmt$(-s.tax.base)}</span></div>
        ${s.tax.lito?`<div class="kv"><span class="k">Low income tax offset</span><span class="v">${fmt$(s.tax.lito)}</span></div>`:''}
        <div class="kv"><span class="k">Medicare levy</span><span class="v">${fmt$(-s.tax.medicare)}</span></div>
        ${o.mls&&s.tax.mls?`<div class="kv"><span class="k">Medicare levy surcharge${(y.mlsFamily?.enabled&&DB.people.length>1)?' ('+s.mlsRate+'% — family rate, see Household summary)':''}</span><span class="v">${fmt$(-s.tax.mls)}</span></div>`:''}
        <div class="kv big" style="border-top:3px double var(--line2);margin-top:4px;padding-top:8px"><span class="k">Tax payable before offsets</span><span class="v">${fmt$(-s.tax.total)}</span></div>
        ${s.divCr?`<div class="kv"><span class="k">Franking credits — share dividends</span><span class="v" style="color:var(--euc)">${fmt$(s.divCr)}</span></div>`:''}
        ${s.fundOffsets?`<div class="kv"><span class="k">Franking credits & FITO — trusts/funds (13Q, 20O)</span><span class="v" style="color:var(--euc)">${fmt$(s.fundOffsets)}</span></div>`:''}
        ${!s.offsets?`<div class="kv"><span class="k">Tax offsets</span><span class="v" style="color:var(--muted)">$0.00</span></div>`:''}
        <div class="kv big" style="border-top:3px double var(--line2);margin-top:4px;padding-top:8px;color:var(--red)"><span class="k">Net tax payable</span><span class="v">${fmt$(-(s.tax.total-s.offsets))}</span></div>
        <div class="kv"><span class="k">Effective tax rate (on assessable income)</span><span class="v">${pct(s.effRate)}</span></div>
        <div class="kv big"><span class="k">Net income after tax</span><span class="v" style="color:var(--euc)">${fmt$(s.assessable-(s.tax.total-s.offsets))}</span></div>
      </div></div>
      <div class="card"><div class="chead"><h2>Refund estimate</h2></div><div class="cbody">
        <div class="kv"><span class="k">Tax withheld by employers</span><span class="v">${fmt$(s.withheld)}</span></div>
        ${s.paygInstalments?`<div class="kv"><span class="k">PAYG instalments</span><span class="v">${fmt$(s.paygInstalments)}</span></div>`:''}
        <div class="kv"><span class="k">Net tax payable (after offsets — see Tax position)</span><span class="v">${fmt$(-(s.tax.total-s.offsets))}</span></div>
        <div class="kv big" style="border-top:3px double var(--line2);margin-top:4px;padding-top:8px"><span class="k">${s.balance>=0?'Estimated refund':'Estimated amount owing'}</span><span class="v" style="${s.balance>=0?'color:var(--euc)':'color:var(--red)'}">${fmt$(s.balance)}</span></div>
        <div class="note">An estimate only — offsets, levies and adjustments beyond this tool (e.g. PHI rebates, offsets phasing) will move the final number.</div>
      </div></div>
    </div>
  </div>`);
};
function summaryHousehold(m,y){
  head(m,'Household FY summary',`${esc(y.label)} for everyone, side by side, plus the combined position.`,
    `<button class="btn" onclick="mytaxExpandAll();setTimeout(()=>window.print(),250)">Print / PDF</button>`);
  const fm=y.mlsFamily||(y.mlsFamily={enabled:false,dependents:1});
  const per=DB.people.map(p=>({p,s:fySummaryNumbers(y,p.id)}));
  const sum=f=>per.reduce((t,x)=>t+f(x.s),0);
  const A=sum(s=>s.assessable),D=sum(s=>s.deductions),T=sum(s=>s.tax.total),Bal=sum(s=>s.balance),W=sum(s=>s.withheld),O=sum(s=>s.offsets);
  // Family MLS: combined household taxable income against family thresholds
  // (roughly double the singles tiers), bumped per dependent beyond the first.
  const famIncome=sum(s=>s.taxable);
  const R=y.rates;
  const famTiers=R.mlsFamily?.tiers||(R.mls||[]).map(t=>({min:t.min*2,rate:t.rate}));
  const dependentIncrement=R.mlsFamily?.dependentIncrement||0;
  const dependents=Math.max(1,num(fm.dependents)||1);
  const bump=(dependents-1)*dependentIncrement;
  let famRate=0;famTiers.forEach(t=>{if(famIncome>=t.min+bump)famRate=t.rate;});
  const anyNoCover=per.some(x=>{const o=bucket(y,x.p.id).summaryOpts;return !(o&&o.hasCover);});
  const anyMls=per.some(x=>{const o=bucket(y,x.p.id).summaryOpts;return o&&o.mls;});
  const li=(k,v,opts={})=>`<div class="kv ${opts.big?'big':''}"><span class="k">${k}</span><span class="v" style="${opts.c||''}">${fmt$(v)}</span></div>`;
  m.insertAdjacentHTML('beforeend',`
  <div class="grid3">
    <div class="stat good"><div class="l">Combined assessable income</div><div class="v">${fmt$0(A)}</div><div class="d">deductions ${fmt$0(D)}</div></div>
    <div class="stat gold"><div class="l">Combined tax payable</div><div class="v">${fmt$0(T)}</div><div class="d">withheld ${fmt$0(W)} · offsets ${fmt$0(O)}</div></div>
    <div class="stat ${Bal>=0?'good':'bad'}"><div class="l">${Bal>=0?'Combined refund estimate':'Combined amount owing'}</div><div class="v">${fmt$0(Math.abs(Bal))}</div><div class="d">net after tax ${fmt$0(A-T)}</div></div>
  </div>
  <div class="grid2">
    ${per.map(({p,s})=>`<div class="card"><div class="chead"><h2>${pdot(p)} ${esc(p.name)}</h2><button class="btn small" onclick="setPerson('${p.id}')">Full statement</button></div><div class="cbody">
      ${li('Assessable income',s.assessable)}
      ${li('Deductions',-s.deductions)}
      ${li('Taxable income',s.taxable,{big:1})}
      ${li('Tax payable (before offsets)',-s.tax.total,{c:'color:var(--red)'})}
      ${li('Withheld + offsets',s.withheld+s.offsets)}
      ${li(s.balance>=0?'Refund estimate':'Amount owing',s.balance,{big:1,c:s.balance>=0?'color:var(--euc)':'color:var(--red)'})}
    </div></div>`).join('')}
  </div>
  <div class="card"><div class="chead"><h2>Medicare levy surcharge — family thresholds</h2></div><div class="cbody">
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:.84rem">
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${fm.enabled?'checked':''} onchange="FY().mlsFamily.enabled=this.checked;save();render()">Family / couple — use combined household income for MLS thresholds</label>
      <label style="display:flex;gap:6px;align-items:center">Dependent children <input type="number" min="0" step="1" class="input" style="width:64px" value="${num(fm.dependents)||1}" onchange="FY().mlsFamily.dependents=Math.max(1,num(this.value)||1);save();render()"></label>
    </div>
    <div class="kv"><span class="k">Combined taxable income (family income for MLS)</span><span class="v">${fmt$(famIncome)}</span></div>
    <div class="kv"><span class="k">Family thresholds${dependents>1?` (incl. +${fmt$0(bump)} for ${dependents-1} extra dependent${dependents-1===1?'':'s'})`:''}</span><span class="v">${famTiers.filter(t=>t.min>0).map(t=>fmt$0(t.min+bump)+' → '+t.rate+'%').join(' · ')||'—'}</span></div>
    <div class="kv big"><span class="k">Family MLS tier</span><span class="v" style="color:${famRate>0&&anyNoCover?'var(--red)':'var(--euc)'}">${famRate>0?(anyNoCover?famRate+'% — applies to anyone without cover':famRate+'% tier, but everyone holds cover'):'Below the surcharge threshold'}</span></div>
    ${fm.enabled?
      `<div class="note">${anyMls?`Applied — each person's <b>Medicare levy surcharge</b> above is now calculated using this ${famRate}% family rate on their own taxable income (where MLS applies and they lack cover). Family thresholds also rise per dependent child; verify with the ATO.`:'Enabled, but no one has "MLS applies" ticked on their FY summary page — toggle that for whoever it should affect.'}</div>`
      :`<div class="note">Not applied yet — tick the box above to assess MLS on your <b>combined</b> household income against family thresholds instead of each person's individual (singles) thresholds. As a couple, this is how the ATO actually assesses MLS. Family thresholds also rise per dependent child; verify with the ATO.</div>`}
  </div></div>`);
}
/* ================= NET WORTH ================= */
/* ================= NET WORTH — dated snapshots, FY-independent ================= */
function nwItemsFor(pids){return DB.nw.items.filter(it=>pids.includes(it.pid));}
function nwEntriesOf(itemId){return DB.nw.entries.filter(e=>e.itemId===itemId).sort((a,b)=>a.date<b.date?-1:1);}
function nwValueAt(itemId,dateISO){
  let v=null;nwEntriesOf(itemId).forEach(e=>{if(e.date<=dateISO)v=num(e.value);});
  return v;
}
function nwMonthSeries(pids,kindFilter,cutoffDate){
  const itemOk=it=>pids.includes(it.pid)&&(!kindFilter||it.kind===kindFilter);
  const eligibleItems=nwItemsFor(pids).filter(itemOk);
  if(!eligibleItems.length)return [];
  const eligibleIds=new Set(eligibleItems.map(it=>it.id));
  const cutoff=cutoffDate||todayISO();
  // Pre-index entries per item, sorted by date — avoids re-scanning the
  // full entries array for every month of the series.
  const byItem={};
  DB.nw.entries.forEach(e=>{
    if(!eligibleIds.has(e.itemId)||e.date>cutoff)return;
    (byItem[e.itemId]=byItem[e.itemId]||[]).push(e);
  });
  Object.values(byItem).forEach(arr=>arr.sort((a,b)=>a.date<b.date?-1:1));
  const all=Object.values(byItem).flat();
  if(!all.length)return [];
  const first=all.reduce((m,e)=>e.date<m?e.date:m,all[0].date).slice(0,7);
  const months=[];
  let [yy,mm]=first.split('-').map(Number);
  while(`${yy}-${String(mm).padStart(2,'0')}`<=cutoff.slice(0,7)){
    const eom=iso(new Date(Date.UTC(yy,mm,0)));
    const monthCutoff=eom<cutoff?eom:cutoff;
    let total=0;
    eligibleItems.forEach(it=>{
      const entries=byItem[it.id];
      if(!entries)return;
      // Binary search for last entry ≤ monthCutoff
      let lo=0,hi=entries.length-1,v=null;
      while(lo<=hi){const mid=(lo+hi)>>1;if(entries[mid].date<=monthCutoff){v=num(entries[mid].value);lo=mid+1;}else hi=mid-1;}
      if(v!=null)total+=v;
    });
    months.push({label:new Date(Date.UTC(yy,mm-1,1)).toLocaleString('en-AU',{month:'short',timeZone:'UTC'})+' '+String(yy).slice(2),value:total,eom:monthCutoff});
    mm++;if(mm>12){mm=1;yy++;}
  }
  return months;
}
/* ---- Superannuation: balance over time (via nw items, kind='super') plus
   a contributions tracker for the current FY against the concessional /
   non-concessional caps. Salary-sacrifice is read live from Income →
   Pre-tax deductions (type 'Additional super contributions') so it isn't
   double-entered. ---- */
const SUPER_CONTRIB_TYPES=['Employer (SG)','Personal deductible','Personal non-concessional','Spouse contribution','Government co-contribution'];
PAGES.super=m=>{
  const y=FY(),b=PD(),pid=DB.currentPid,R=y.rates;
  const items=DB.nw.items.filter(it=>it.pid===pid&&it.kind==='super');
  head(m,'Superannuation',`Track your super balance over time, and your ${esc(fyDisplay(y))} contributions against the caps.`,
    `<button class="btn" onclick="nwItemAdd(null,'super')">+ Add super fund</button>`);

  // Scope chart and balances to the selected FY end (or today for current FY)
  const {end:fyEnd}=fyRange(y);
  const today=todayISO();
  const cutoff=isAllFY()?today:(fyEnd<today?fyEnd:today);
  const isFrozen=cutoff<today;

  const series=nwMonthSeries([pid],'super',cutoff);
  const latest=series.length?series[series.length-1].value:0;
  const balLabel=isAllFY()?'Super balance today':(isFrozen?`Super balance at ${esc(fyDisplay(y))} end`:'Super balance today');
  const balSub=isFrozen?`as at ${fmtDate(cutoff)}`:'across all funds';

  m.insertAdjacentHTML('beforeend',`
  <div class="grid3"><div class="stat good"><div class="l">${balLabel}</div><div class="v">${fmt$0(latest)}</div><div class="d">${balSub}</div></div></div>
  <div class="card"><div class="chead"><h2>Balance over time${isFrozen?` — up to ${esc(fyDisplay(y))} end`:''}</h2></div><div class="cbody">${series.length?lineChartSVG(series,{aria:'Superannuation balance over time'}):'<div class="muted">Add a fund above, then a balance entry, to start the timeline.</div>'}</div></div>`);

  if(items.length){
    const rows=items.map(it=>{
      // Show balance as of the FY cutoff date, not the latest-ever entry
      const es=nwEntriesOf(it.id).filter(e=>e.date<=cutoff);
      const cur=es.length?num(es[es.length-1].value):0;
      const curDate=es.length?es[es.length-1].date:'';
      return `<tr><td><b>${esc(it.name)}</b>${curDate?`<div class="muted" style="font-size:.78rem">as of ${fmtDate(curDate)}${isFrozen?' (at FY end)':''}</div>`:''}</td><td class="num">${fmt$0(cur)}</td>
        <td class="rowact"><button class="btn ghost small" onclick="nwEntryAdd('${it.id}')">+ Balance entry</button>
        <button class="btn ghost small" onclick="nwItemAdd('${it.id}')">Edit</button>
        <button class="btn ghost small" onclick="confirmDel('Delete ${esc(it.name)} and its balance history?',()=>{DB.nw.entries=DB.nw.entries.filter(e=>e.itemId!=='${it.id}');DB.nw.items=DB.nw.items.filter(x=>x.id!=='${it.id}');save();render()})">✕</button></td></tr>`;
    }).join('');
    m.insertAdjacentHTML('beforeend',`<div class="card"><div class="chead"><h2>Funds${isFrozen?` — as at ${fmtDate(cutoff)}`:''}</h2></div><div class="cbody tight"><table class="tbl"><thead><tr><th>Fund</th><th class="num">Balance</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
  }
  // Contributions for the current FY
  const salSac=(b.preTaxDeds||[]).filter(r=>r.type==='Additional super contributions').reduce((s,r)=>s+num(r.yearly),0);
  const sgRate=R.superSGRate||11.5;
  const autoSG=b.incomes.filter(r=>r.attractsSuper).reduce((s,r)=>s+num(r.yearly)*sgRate/100,0);
  const contribs=b.superContributions||[];
  const sumType=t=>contribs.filter(c=>c.type===t).reduce((s,c)=>s+num(c.amount),0);
  const sgTotal=sumType('Employer (SG)'),persDed=sumType('Personal deductible');
  const persNonConc=sumType('Personal non-concessional'),spouse=sumType('Spouse contribution'),govtCo=sumType('Government co-contribution');
  // autoSG is a preview estimate from income rows; once the person logs
  // any actual "Employer (SG)" contributions (as the hint below tells them
  // to), use that real figure instead of also adding the estimate on top —
  // otherwise employer super gets double-counted against the cap.
  const concTotal=salSac+(sgTotal>0?sgTotal:autoSG)+persDed,nonConcTotal=persNonConc+spouse;
  const concCap=num(R.superCapConcessional)||30000,nonConcCap=num(R.superCapNonConcessional)||120000;
  const bar=(used,cap)=>{const pct=cap>0?Math.min(100,used/cap*100):0,over=used>cap;
    return `<div style="background:var(--surface2);border-radius:6px;height:8px;overflow:hidden;margin:6px 0"><div style="background:${over?'var(--red)':'var(--euc)'};height:100%;width:${pct}%"></div></div>`;};
  const contribRows=contribs.map((c,i)=>`<tr><td>${esc(c.type)}</td><td>${c.date?fmtDate(c.date):''}</td><td class="muted">${esc(c.note||'')}</td><td class="num">${fmt$(c.amount)}</td>
    <td class="rowact"><button class="btn ghost small" onclick="superContribAdd(${i})">Edit</button><button class="btn ghost small" onclick="superContribDelete(${i})">✕</button></td></tr>`).join('');
  m.insertAdjacentHTML('beforeend',`
  <div class="card"><div class="chead"><h2>Contributions — ${esc(fyDisplay(y))}</h2><button class="btn small" onclick="superContribAdd()">+ Add contribution</button></div>
  <div class="cbody">
    ${salSac?`<div class="kv"><span class="k">Salary sacrifice (from Income → Pre-tax deductions)</span><span class="v">${fmt$(salSac)}</span></div>`:''}
    ${autoSG&&!sgTotal?`<div class="kv"><span class="k">Estimated employer SG from income (${sgRate}%)</span><span class="v">${fmt$(autoSG)}</span></div><div class="muted" style="font-size:.74rem;margin:-6px 0 6px">Auto-calculated from income rows with "Attracts super" ticked — log actual amounts under "Employer (SG)" below once you receive your statement, which will replace this estimate.</div>`:''}
    <div class="cbody tight" style="padding:8px 0 0"><table class="tbl"><thead><tr><th>Type</th><th>Date</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>${contribRows||'<tr><td colspan="5" class="muted">No manually-logged contributions yet.</td></tr>'}</tbody></table></div>
    <div class="mt"><b>Concessional</b> (employer SG, salary sacrifice, personal deductible) — ${fmt$(concTotal)} of ${fmt$(concCap)} cap${bar(concTotal,concCap)}
    ${concTotal>concCap?`<div class="note" style="border-color:var(--red)">Over the concessional cap by ${fmt$(concTotal-concCap)} — excess concessional contributions are generally taxed at your marginal rate and may attract an excess concessional contributions charge. Check with the ATO / your fund.</div>`:''}</div>
    <div class="mt"><b>Non-concessional</b> (personal after-tax, spouse) — ${fmt$(nonConcTotal)} of ${fmt$(nonConcCap)} cap${bar(nonConcTotal,nonConcCap)}
    ${nonConcTotal>nonConcCap?`<div class="note" style="border-color:var(--red)">Over the non-concessional cap by ${fmt$(nonConcTotal-nonConcCap)} — excess non-concessional contributions may be taxed at the top rate unless withdrawn. Check with the ATO / your fund.</div>`:''}</div>
    ${govtCo?`<div class="mt muted" style="font-size:.8rem">Government co-contribution: ${fmt$(govtCo)} — doesn't count towards either cap.</div>`:''}
  </div></div>
  <div class="note">Concessional cap ${fmt$0(concCap)} and non-concessional cap ${fmt$0(nonConcCap)} are set in Settings — verify these against current ATO figures, as they're indexed periodically. The non-concessional cap can also depend on your total super balance and "bring-forward" rules, which aren't modelled here.</div>`);
};
function superContribAdd(i){
  if(lockedGuard())return;
  const B=PD(),c=i!=null?B.superContributions[i]:{type:SUPER_CONTRIB_TYPES[0],amount:'',date:'',note:''};
  modal(i!=null?'Edit contribution':'Add contribution',`
    <div class="fldrow"><div><label class="fld">Type</label><select id="f_t" class="input">${SUPER_CONTRIB_TYPES.map(t=>`<option ${c.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
    <div><label class="fld">Amount ($)</label><input id="f_a" class="input money" value="${c.amount}"></div></div>
    <div class="fldrow mt"><div><label class="fld">Date</label><input id="f_d" type="date" class="input" value="${c.date||''}"></div>
    <div style="flex:2"><label class="fld">Note <span class="muted">(optional)</span></label><input id="f_note" class="input" value="${esc(c.note||'')}"></div></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="superContribSave(${i==null?'null':i})">Save</button>`);
}
function superContribSave(i){
  const B=PD();B.superContributions=B.superContributions||[];
  const c={id:i!=null?B.superContributions[i].id:uid(),type:$('#f_t').value,amount:num($('#f_a').value),date:$('#f_d').value||'',note:$('#f_note').value.trim()};
  if(i!=null)B.superContributions[i]=c;else B.superContributions.push(c);
  save();closeModal();render();toast('Contribution saved');
}
function superContribDelete(i){if(lockedGuard())return;const B=PD();B.superContributions.splice(i,1);save();render();}
PAGES.networth=m=>{
  const pids=isAll()?DB.people.map(p=>p.id):[DB.currentPid];
  const y=FY();
  const fyEnd=fyRange(y).end;
  const today=todayISO();
  // For past/locked FYs, freeze everything as of that FY's end date. For
  // the real current FY (not yet over), use today instead, since the FY
  // hasn't finished yet — there's no "end" to freeze at.
  const cutoff=fyEnd<today?fyEnd:today;
  const isFrozen=cutoff<today;
  head(m,isAll()?'Household net worth':'Net worth',
    isFrozen?`Your financial position as it stood at the end of <b>${esc(fyDisplay(y))}</b> (${fmtDate(cutoff)}) — frozen in time. Switch to the current FY to see today's figures.`
      :`Your total financial position today — assets, savings, super, investments, and liabilities combined.`,
    isAll()?`<button class="btn" onclick="nwSnapshot()">📸 Snapshot</button>`:
    `<button class="btn" onclick="nwItemAdd()">+ Add item</button>
    <button class="btn primary" onclick="nwSnapshot()">📸 Snapshot</button>`);
  // Exclude auto-generated 'holding' bookkeeping items (created by
  // assetFetchPrice purely to give the chart dated history for share/ETF
  // values) from the items shown/counted on this page — they'd otherwise
  // duplicate what the live "Investment holdings" section below already
  // shows for the same asset. nwMonthSeries() below does its own separate
  // lookup, so the chart/total still use their historical entries.
  const items=nwItemsFor(pids).filter(it=>it.kind!=='holding');
  const series=nwMonthSeries(pids,null,cutoff);
  const latest=series.length?series[series.length-1].value:0;
  const prevM=series.length>1?series[series.length-2].value:null;
  const dltM=prevM!=null?latest-prevM:null;
  // 1-year change, measured back from the cutoff (not always "today") so
  // past-FY views show the change as it stood at that point in time too.
  const oneYrAgo=iso(new Date(new Date(cutoff+'T00:00:00Z').getTime()-365*86400*1000));
  const seriesOneYr=series.filter(s=>s.eom<=oneYrAgo);
  const prev1yr=seriesOneYr.length?seriesOneYr[seriesOneYr.length-1].value:null;
  const dlt1yr=prev1yr!=null?latest-prev1yr:null;
  // All-time change
  const allTimeFirst=series.length?series[0].value:null;
  const dltAll=allTimeFirst!=null&&series.length>1?latest-allTimeFirst:null;
  const chg=(d,lbl)=>d==null?`<div class="stat"><div class="l">${lbl}</div><div class="v muted">—</div></div>`
    :`<div class="stat ${d>=0?'good':'bad'}"><div class="l">${lbl}</div><div class="v">${d>=0?'▲':'▼'} ${fmt$0(Math.abs(d))}</div><div class="d">${d>=0?'increase':'decrease'}</div></div>`;
  m.insertAdjacentHTML('beforeend',`
  <div class="grid3">
    <div class="stat good"><div class="l">${isAll()?'Household net worth':'Net worth'}${isFrozen?` as of ${fmtDate(cutoff)}`:' today'}</div><div class="v">${fmt$0(latest)}</div><div class="d">${items.length} items tracked</div></div>
    ${chg(dltM,'Change that month')}
    ${chg(dlt1yr,'Change (12 months)')}
    ${chg(dltAll,'Change all time')}
  </div>
  <div class="card"><div class="chead"><h2>Net worth over time</h2><span class="hint">month-end totals${isFrozen?` up to ${esc(fyDisplay(y))}`:''}</span></div>
    <div class="cbody">${series.length?lineChartSVG(series,{aria:'Net worth over time'}):'<div class="muted">Add items and record values to start the timeline.</div>'}</div></div>`);
  // per-item table with MoM change
  const lastEOM=(()=>{const d=new Date(cutoff+'T00:00:00Z');return iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),0)));})();
  const lastEOM2=lastEOM;
  // Derive holding rows from share/ETF assets (auto-synced) — only ones
  // actually open during this FY, matching the same visibility rule the
  // Assets page uses, so a closed position stops counting toward net
  // worth in FYs after it was closed (but still shows correctly in
  // earlier/frozen FY views, since closing never rewrites history).
  const holdingAssets=assetsForPerson(pids).filter(a=>(a.kind==='shares'||a.kind==='managed_fund')&&assetVisibleInFY(a,y));
  const holdingRows=holdingAssets.length?holdingAssets.map(a=>{
    const curV=assetCurrentValue(a);const lastP=a.lastPrice;
    const hq=assetHeldQty(a);const cb=assetCostBasis(a);
    const gl=curV!=null?curV-cb:null;
    const glpct=cb>0&&gl!=null?gl/cb*100:null;
    return `<tr style="background:var(--surface2)"><td><b>${esc(a.name)}</b>
      ${a.code?`<span class="badge blue">${esc(a.code)}</span>`:''}
      <span class="badge ${a.kind==='managed_fund'?'gold':'blue'}">${a.kind==='managed_fund'?'ETF / Managed Fund':'Shares'}</span>
      <div style="font-size:.78rem;color:var(--muted)">${hq.toLocaleString()} units · avg ${cb&&hq?fmt$(cb/hq):fmt$(0)}/unit · cost basis ${fmt$0(cb)}</div></td>
      <td class="num">${curV!=null?fmt$(curV):'<span class="muted">fetch price</span>'}</td>
      <td>${lastP?fmtDate(lastP.date):''}</td>
      <td class="num">${gl==null?'<span class="muted">—</span>':`<span class="${gl>=0?'mom-up':'mom-down'}">${gl>=0?'▲':'▼'} ${fmt$(Math.abs(gl))}${glpct!=null?' ('+glpct.toFixed(1)+'%)':''}</span>`}</td>
      <td class="rowact">${isAll()?'':`<button class="btn ghost small" onclick="assetFetchPrice('${a.id}')">↻ price</button>
        <button class="btn ghost small" onclick="go('assets')">manage ↗</button>`}</td></tr>`;
  }).join(''):'';
  const itemRowHtml=it=>{
    const es=nwEntriesOf(it.id).filter(e=>e.date<=cutoff);
    const cur=es.length?es[es.length-1]:null;
    const prevEntry=es.filter(e=>e.date<=lastEOM2).slice(-1)[0];
    const prevIsRecent=prevEntry&&(new Date(lastEOM2)-new Date(prevEntry.date+'T00:00:00Z'))<60*86400*1000;
    const prev=prevIsRecent?num(prevEntry.value):null;
    const d=cur&&cur.date>lastEOM2&&prev!=null?num(cur.value)-prev:null;
    const tag=isAll()?pdot(person(it.pid))+' ':'';
    const asset=it.assetId?DB.assets.find(a=>a.id===it.assetId):null;
    // Loan interest inline calculation — uses the rate in effect as of the cutoff
    let interestNote='';
    if(it.kind==='liability'&&cur){
      const rateAtCutoff=loanRateAt(it,cutoff);
      if(rateAtCutoff!=null){
        const loanBal=Math.abs(num(cur.value));
        const offsetItem=it.offsetItemId?DB.nw.items.find(x=>x.id===it.offsetItemId):null;
        const offsetEs=offsetItem?nwEntriesOf(offsetItem.id).filter(e=>e.date<=cutoff):[];
        const offsetBal=offsetEs.length?Math.max(0,num(offsetEs[offsetEs.length-1].value)):0;
        const effBal=Math.max(0,loanBal-offsetBal);
        const mo=effBal*rateAtCutoff/100/12;
        interestNote=`<div style="font-size:.78rem;color:var(--muted);margin-top:3px">${rateAtCutoff}% p.a.${offsetBal>0?` · eff. ${fmt$(effBal)} (−${fmt$(offsetBal)} offset)`:''} · <b>~${fmt$(mo)}/mo</b> interest · <a href="#" onclick="nwLoanDetail('${it.id}');return false">history ↗</a></div>`;
      }
    }
    return `<tr><td>${tag}<b>${esc(it.name)}</b> ${it.code?`<span class="badge blue">${esc(it.code)}${it.qty?' × '+(+it.qty).toLocaleString():''}</span>`:''}
      ${asset?`<span class="badge gold">${esc(asset.name)}</span>`:''}
      ${nwKindBadge(it.kind)}${interestNote}</td>
      <td class="num">${cur?fmt$(cur.value):'<span class="muted">—</span>'}</td>
      <td>${cur?fmtDate(cur.date):''}</td>
      <td class="num">${d==null?'<span class="muted">—</span>':`<span class="${d>=0?'mom-up':'mom-down'}">${d>=0?'▲':'▼'} ${fmt$(Math.abs(d))}</span>`}</td>
      <td class="rowact">${isAll()?'':`${it.kind==='share'&&it.code?`<button class="btn ghost small" onclick="nwFetchPrice('${it.id}')" title="Fetch live price">↻</button>`:''}
        <button class="btn ghost small" onclick="nwEntryAdd('${it.id}')">+ entry</button>
        <button class="btn ghost small" onclick="nwHistory('${it.id}')">history</button>
        <button class="btn ghost small" onclick="nwItemAdd('${it.id}')">Edit</button>
        <button class="btn ghost small" onclick="confirmDel('Delete ${esc(it.name)} and all its entries?',()=>{DB.nw.items=DB.nw.items.filter(x=>x.id!=='${it.id}');DB.nw.entries=DB.nw.entries.filter(e=>e.itemId!=='${it.id}');save();render()})">✕</button>`}</td></tr>`;
  };
  const itemVal=it=>{const es=nwEntriesOf(it.id).filter(e=>e.date<=cutoff);return es.length?num(es[es.length-1].value):0;};
  // Group into collapsible categories: savings, offset, liability, super,
  // share (manually-tracked), holdings (auto-synced from Assets), asset.
  const NW_CATS=[['savings','Savings accounts'],['offset','Offset accounts'],['liability','Loans & liabilities'],['super','Superannuation'],['share','Shares / ETF (manual)'],['holdings','Investment holdings'],['asset','Other assets']];
  const catBuckets={savings:[],offset:[],liability:[],super:[],share:[],asset:[]};
  items.forEach(it=>{(catBuckets[it.kind]||catBuckets.asset).push(it);});
  const rows=NW_CATS.map(([key,label])=>{
    if(key==='holdings'){
      if(!holdingAssets.length)return'';
      const sub=holdingAssets.reduce((s,a)=>s+(assetCurrentValue(a)||0),0);
      const expanded=!NW_CAT_COLLAPSED.has(key);
      return `<tr class="subhead" style="cursor:pointer" onclick="nwCatToggle('${key}')"><td colspan="5"><span style="display:inline-block;width:1em">${expanded?'▾':'▸'}</span><b>${esc(label)}</b> <span class="muted" style="font-weight:400;font-size:.78rem">(${holdingAssets.length}) · ${fmt$0(sub)}</span></td></tr>`
        +(expanded?holdingRows:'');
    }
    const bucket2=catBuckets[key]||[];
    if(!bucket2.length)return'';
    const sub=bucket2.reduce((s,it)=>s+itemVal(it),0);
    const expanded=!NW_CAT_COLLAPSED.has(key);
    return `<tr class="subhead" style="cursor:pointer" onclick="nwCatToggle('${key}')"><td colspan="5"><span style="display:inline-block;width:1em">${expanded?'▾':'▸'}</span><b>${esc(label)}</b> <span class="muted" style="font-weight:400;font-size:.78rem">(${bucket2.length}) · ${fmt$0(sub)}</span></td></tr>`
      +(expanded?bucket2.map(itemRowHtml).join(''):'');
  }).join('');
  m.insertAdjacentHTML('beforeend',`
  <div class="card"><div class="chead"><h2>Items</h2><span class="hint">change vs last month-end</span></div><div class="cbody tight"><table class="tbl">
    <thead><tr><th>Item</th><th class="num">Latest value</th><th>As at</th><th class="num">Δ this month</th><th></th></tr></thead>
    <tbody>${rows||'<tr><td colspan="5" class="muted">No items yet — add savings, offset, loan, super, or shares (via Assets).</td></tr>'}</tbody></table></div></div>
  ${isAll()?'<div class="note">Switch to a person in the sidebar to add items or entries.</div>':'<div class="note">Live share prices work best served on localhost. Items created via Assets stay linked here.</div>'}`);
  // Loan interest analysis card — scoped to the selected FY (frozen for
  // past FYs, same as the rest of this page), not all-time history.
  const loans2=items.filter(it=>it.kind==='liability'&&(it.interestRate||(it.rateHistory||[]).length));
  if(loans2.length&&!isAll()){
    const fyStart=fyRange(y).start;
    const loanCards=loans2.map(loan=>{
      const loanEs=nwEntriesOf(loan.id);
      const offsetItem=loan.offsetItemId?DB.nw.items.find(x=>x.id===loan.offsetItemId):null;
      const offsetEs=offsetItem?nwEntriesOf(offsetItem.id):[];
      const allKeys=[...new Set([...loanEs,...offsetEs].map(e=>e.date.slice(0,7)))].sort();
      if(!allKeys.length)return'';
      // Start no earlier than the FY's own start month (even if the loan
      // has older entries from before this FY) and never go past cutoff.
      const earliestKey=allKeys[0]+'-01';
      const startKey=earliestKey>fyStart?earliestKey:fyStart;
      const pts=[];let [yy,mm]=startKey.split('-').map(Number);
      while(`${yy}-${String(mm).padStart(2,'0')}`<=cutoff.slice(0,7)){
        const eom=iso(new Date(Date.UTC(yy,mm,0)));const cut=eom<cutoff?eom:cutoff;
        const lb=nwValueAt(loan.id,cut);
        if(lb!=null){
          const ob=offsetItem?nwValueAt(offsetItem.id,cut):null;
          const lbal=Math.abs(lb),obal=ob!=null?Math.max(0,ob):0;
          const eff=Math.max(0,lbal-obal);
          const rateThen=loanRateAt(loan,cut)||0;
          pts.push({label:new Date(Date.UTC(yy,mm-1,1)).toLocaleString('en-AU',{month:'short',timeZone:'UTC'})+String(yy).slice(2),value:eff*rateThen/100/12,lbal,obal,eff,rate:rateThen});
        }
        mm++;if(mm>12){mm=1;yy++;}
      }
      if(!pts.length)return'';
      const latest=pts[pts.length-1];
      const total=pts.reduce((s,p)=>s+p.value,0);
      const curRate=loanRateAt(loan,cutoff);
      return `<div style="margin-bottom:18px"><div style="font-weight:700;margin-bottom:8px">${esc(loan.name)}
        <span class="badge red">${curRate!=null?curRate+'% p.a.':'rate not set'}${isFrozen?' as of '+fmtDate(cutoff):''}</span> <a href="#" style="font-size:.78rem" onclick="nwLoanRateHistory('${loan.id}');return false">rate history ↗</a>
        ${offsetItem?`<span class="badge euc">offset: ${esc(offsetItem.name)}</span>`:'<span class="muted" style="font-size:.8rem"> · no offset linked</span>'}</div>
        <div class="grid3" style="gap:10px;margin-bottom:10px">
          <div class="stat"><div class="l">Loan balance</div><div class="v" style="font-size:1.1rem">${fmt$(latest.lbal)}</div></div>
          ${offsetItem?`<div class="stat"><div class="l">Offset balance</div><div class="v" style="font-size:1.1rem;color:var(--euc)">${fmt$(latest.obal)}</div><div class="d">eff. ${fmt$(latest.eff)}</div></div>`:''}
          <div class="stat gold"><div class="l">Est. interest/month</div><div class="v">${fmt$(latest.value)}</div></div>
          <div class="stat"><div class="l">Total interest est. — ${esc(fyDisplay(y))}</div><div class="v" style="font-size:1.1rem">${fmt$(total)}</div><div class="d">${pts.length} months</div></div>
        </div>
        ${pts.length>1?lineChartSVG(pts,{aria:'Monthly interest estimate'}):''}
      </div>`;
    }).filter(Boolean).join('<hr style="border:none;border-top:1px solid var(--line);margin:14px 0">');
    if(loanCards)m.insertAdjacentHTML('beforeend',`<div class="card"><div class="chead"><h2>Loan interest analysis</h2><span class="hint">estimated monthly interest incorporating offset balance history</span></div><div class="cbody">${loanCards}<div class="note">These are estimates based on your recorded balances using the stated annual rate ÷ 12. Your lender's actual calculation may differ. As your offset account grows, the effective balance and therefore interest reduces.</div></div></div>`);
  }
};
/* ---- NW kind metadata ---- */
const NW_KINDS={
  asset:    {label:'Asset',          badge:'euc'},
  savings:  {label:'Savings account',badge:'euc'},
  offset:   {label:'Offset account', badge:'euc'},
  liability:{label:'Loan / liability',badge:'red'},
  share:    {label:'Shares / ETF',   badge:'blue'},
  super:    {label:'Superannuation', badge:'gold'},
};
function nwKindBadge(k){const m=NW_KINDS[k]||{label:k,badge:'euc'};return`<span class="badge ${m.badge}">${m.label}</span>`;}

function nwItemAdd(id,presetKind){
  const it=id?DB.nw.items.find(x=>x.id===id):{name:'',kind:presetKind||'asset',code:'',qty:'',interestRate:'',offsetItemId:''};
  const isLoan=it.kind==='liability';
  const isShare=it.kind==='share';
  // savings/offset items available to link
  const savingsOpts=DB.nw.items.filter(x=>x.id!==id&&(x.kind==='savings'||x.kind==='offset')&&(x.pid===DB.currentPid||isAll()))
    .map(x=>`<option value="${x.id}" ${it.offsetItemId===x.id?'selected':''}>${esc(x.name)}</option>`).join('');
  modal(id?'Edit item':'Add net worth item',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Name</label><input id="f_n" class="input" value="${esc(it.name)}" placeholder="e.g. Offset account, ANZ home loan, VAS holding"></div>
    <div><label class="fld">Type</label><select id="f_k" class="input" onchange="nwKindChange(this.value)">
      <option value="asset"     ${it.kind==='asset'?'selected':''}>Asset (general)</option>
      <option value="savings"   ${it.kind==='savings'?'selected':''}>Savings account</option>
      <option value="offset"    ${it.kind==='offset'?'selected':''}>Offset account</option>
      <option value="liability" ${it.kind==='liability'?'selected':''}>Loan / liability</option>
      <option value="super"     ${it.kind==='super'?'selected':''}>Superannuation</option>
      <option value="share"     ${it.kind==='share'?'selected':''}>Shares / ETF (legacy)</option></select></div></div>
    ${(!it.id||it.kind!=='share')?`<div class="note" style="margin-top:10px">💡 To track a new share or ETF holding, use the <a href="#" onclick="closeModal();go('assets');return false">Assets page</a> — it tracks buy/sell transactions, cost basis and live prices, and feeds automatically into Net Worth.</div>`:''}
    <div id="loanFlds" style="display:${isLoan?'flex':'none'};flex-direction:column;gap:10px" class="mt">
      <div class="fldrow">
        <div>
          <label class="fld">Annual interest rate (%)</label>
          ${id?`<div class="input" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span>${loanCurrentRate(it)!=null?loanCurrentRate(it)+'%':'<span class="muted">not set</span>'}</span>
            <a href="#" style="font-size:.8rem" onclick="nwLoanRateHistory('${id}');return false">history ↗</a>
          </div>
          <input type="hidden" id="f_ir" value="${it.interestRate||''}">`
          :`<input id="f_ir" class="input money" value="${it.interestRate||''}" placeholder="e.g. 6.19" oninput="nwLoanCalc()">
          <div class="hint" style="margin-top:4px">Add rate changes over time after saving, via "history".</div>`}
        </div>
        <div style="flex:2"><label class="fld">Linked offset / savings account <span class="muted">(optional)</span></label>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="f_oid" class="input" onchange="nwOffsetSelChange()" style="flex:1">
              <option value="">— none —</option>${savingsOpts}
              <option value="__new__">+ Create new offset account…</option>
            </select>
          </div>
          <div id="nwNewOffsetFlds" style="display:none;margin-top:8px;flex-direction:column;gap:8px">
            <input id="f_newoff_name" class="input" placeholder="Offset account name" value="Offset account">
            <input id="f_newoff_bal" class="input money" placeholder="Current balance ($) e.g. 50000">
          </div>
        </div>
      </div>
      <div class="fldrow">
        <div><label class="fld">Offset coverage %</label><input id="f_opct" class="input money" value="${it.offsetPct??100}" placeholder="100" oninput="nwLoanCalc()"></div>
        <div><label class="fld">Loan term (years)</label><input id="f_term" class="input money" value="${it.loanTermYears||''}" placeholder="e.g. 30" oninput="nwLoanCalc()"></div>
        <div><label class="fld">Loan start date</label><input id="f_lstart" type="date" class="input" value="${it.loanStartDate||''}" oninput="nwLoanCalc()"></div>
      </div>
      <div id="loanCalcPrev" class="note" style="margin-top:0"></div>
    </div>
    <div id="shareFlds" style="display:${isShare?'flex':'none'};flex-direction:column;gap:10px" class="mt">
      ${secSearchBox('#f_c')}
      <div class="fldrow mt"><div><label class="fld">ASX code</label><input id="f_c" class="input" value="${esc(it.code||'')}" style="text-transform:uppercase"></div>
      <div><label class="fld">Quantity (units)</label><input id="f_q" class="input money" value="${it.qty||''}"></div></div>
    </div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="nwItemSave('${id||''}')">Save</button>`);
  if(isLoan)setTimeout(nwLoanCalc,50);
}
function nwKindChange(v){
  $('#loanFlds').style.display=v==='liability'?'flex':'none';
  $('#shareFlds').style.display=v==='share'?'flex':'none';
}
function nwOffsetSelChange(){
  const v=$('#f_oid').value;
  const el=$('#nwNewOffsetFlds');
  if(el)el.style.display=v==='__new__'?'flex':'none';
  nwLoanCalc();
}
/* ---- Loan interest rate — tracked historically (rates change over time) ----
   loan.interestRate is kept as a convenience "current rate" field for any
   older code path that reads it directly; rateHistory is the source of
   truth once it has entries. */
function loanRateAt(loan,dateISO){
  const hist=(loan.rateHistory||[]).slice().sort((a,b)=>a.date<b.date?-1:1);
  if(!hist.length)return loan.interestRate?num(loan.interestRate):null;
  let rate=null;
  hist.forEach(h=>{if(h.date<=dateISO)rate=num(h.rate);});
  if(rate==null)rate=num(hist[0].rate); // date predates earliest record — use earliest known rate
  return rate;
}
function loanCurrentRate(loan){return loanRateAt(loan,todayISO());}
function nwSyncLoanRate(itemId){
  const it=DB.nw.items.find(x=>x.id===itemId);if(!it)return;
  const hist=(it.rateHistory||[]).slice().sort((a,b)=>a.date<b.date?-1:1);
  if(hist.length)it.interestRate=hist[hist.length-1].rate;
}
function nwLoanRateHistory(itemId){
  const it=DB.nw.items.find(x=>x.id===itemId);if(!it)return;
  const hist=(it.rateHistory||[]).slice().sort((a,b)=>a.date<b.date?-1:1);
  const rows=hist.map((h,i)=>{
    const isActive=h.date<=todayISO()&&(!hist[i+1]||hist[i+1].date>todayISO());
    return `<tr><td>${fmtDate(h.date)}${isActive?` <span class="badge euc" style="font-size:.65rem">current</span>`:''}</td><td class="num">${h.rate}%</td>
      <td class="rowact"><button class="btn ghost small" onclick="nwLoanRateEdit('${itemId}',${i})">Edit</button>
      <button class="btn ghost small" onclick="confirmDel('Delete this rate?',()=>{DB.nw.items.find(x=>x.id==='${itemId}').rateHistory.splice(${i},1);nwSyncLoanRate('${itemId}');save();closeModal();nwLoanRateHistory('${itemId}')})">✕</button></td></tr>`;
  }).join('');
  const chart=hist.length>1?lineChartSVG(hist.map(h=>({label:fmtDate(h.date),value:num(h.rate)})),{aria:'Interest rate history'}):'';
  modal(`Rate history — ${esc(it.name)}`,`
    ${chart}
    ${rows?`<table class="tbl mt"><thead><tr><th>Effective from</th><th class="num">Rate</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="hint">No rate recorded yet — add the rate this loan started at.</div>'}
    <button class="btn small primary mt" onclick="nwLoanRateEdit('${itemId}')">+ Add rate change</button>`,
    `<button class="btn" data-close>Close</button>`);
}
function nwLoanRateEdit(itemId,i){
  const it=DB.nw.items.find(x=>x.id===itemId);
  if(!it)return;
  const h=i!=null?it.rateHistory[i]:{date:todayISO(),rate:it.interestRate||''};
  modal(i!=null?'Edit rate':'Add rate change',`
    <div class="fldrow"><div><label class="fld">Rate (% p.a.)</label><input id="f_lr" class="input money" value="${h.rate}" placeholder="e.g. 6.19"></div>
    <div><label class="fld">Effective from</label><input id="f_ld" type="date" class="input" value="${h.date}"></div></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="nwLoanRateSave('${itemId}',${i==null?'null':i})">Save</button>`);
}
function nwLoanRateSave(itemId,i){
  const it=DB.nw.items.find(x=>x.id===itemId);
  if(!it)return;
  it.rateHistory=it.rateHistory||[];
  const h={date:$('#f_ld').value||todayISO(),rate:num($('#f_lr').value)};
  if(i!=null)it.rateHistory[i]=h;else it.rateHistory.push(h);
  nwSyncLoanRate(itemId);
  save();closeModal();nwLoanRateHistory(itemId);
}
function nwLoanCalc(){
  const el=$('#loanCalcPrev');if(!el)return;
  const rate=num($('#f_ir').value);
  const oid=$('#f_oid').value;
  const pct=Math.min(100,Math.max(0,num($('#f_opct')?.value??100)||100));
  if(!rate){el.innerHTML='';return;}
  // Find the loan balance from the item currently being edited. The modal
  // passes the item id through the form; we identify it as the liability
  // whose offsetItemId matches the current selection, or fall back to the
  // first liability. This is an approximation — the preview is informational.
  const loanItems=DB.nw.items.filter(x=>x.kind==='liability');
  const loanItem=loanItems.find(x=>x.offsetItemId===oid)||loanItems[0];
  const loanBal=loanItem?Math.abs(num((nwEntriesOf(loanItem.id).slice(-1)[0]||{}).value||0)):0;
  const offsetItem=oid?DB.nw.items.find(x=>x.id===oid):null;
  const offsetBalRaw=offsetItem?Math.max(0,num((nwEntriesOf(offsetItem.id).slice(-1)[0]||{}).value||0)):0;
  const offsetBal=offsetBalRaw*pct/100;
  const eff=Math.max(0,loanBal-offsetBal);
  const mo=eff*rate/100/12;
  el.innerHTML=offsetBal>0
    ?`Using current entries: loan <b>${fmt$(loanBal)}</b> − offset <b>${fmt$(offsetBal)}</b>${pct<100?` (${pct}% of ${fmt$(offsetBalRaw)})`:''}= effective <b>${fmt$(eff)}</b> → ~<b>${fmt$(mo)}/mo</b> interest at ${rate}%`
    :`At current balance: <b>${fmt$(loanBal)}</b> × ${rate}% ÷ 12 → ~<b>${fmt$(mo)}/mo</b> interest`;
}
function nwItemSave(id){
  const kind=$('#f_k').value;
  let offsetItemId=kind==='liability'?($('#f_oid').value||''):'';
  // If user chose "+ Create new offset account", create it first then link it
  if(kind==='liability'&&offsetItemId==='__new__'){
    const offName=($('#f_newoff_name')?.value||'').trim()||'Offset account';
    const offBal=num($('#f_newoff_bal')?.value);
    const pid=id?(DB.nw.items.find(x=>x.id===id)?.pid||DB.currentPid):DB.currentPid;
    const newOff={id:uid(),pid,name:offName,kind:'offset'};
    DB.nw.items.push(newOff);
    if(offBal)DB.nw.entries.push({id:uid(),itemId:newOff.id,date:todayISO(),value:offBal});
    offsetItemId=newOff.id;
  }
  const base={name:$('#f_n').value.trim()||'Item',kind,
    code:kind==='share'?$('#f_c').value.trim().toUpperCase():'',
    qty:kind==='share'?num($('#f_q').value)||'':'',
    interestRate:kind==='liability'?num($('#f_ir').value)||'':'',
    offsetItemId:kind==='liability'?offsetItemId:'',
    offsetPct:kind==='liability'?num($('#f_opct')?.value??100)||100:'',
    loanTermYears:kind==='liability'?num($('#f_term')?.value)||'':'',
    loanStartDate:kind==='liability'?($('#f_lstart')?.value||''):'',
  };
  if(id){const it=DB.nw.items.find(x=>x.id===id);Object.assign(it,base);}
  else{
    const newItem={id:uid(),pid:DB.currentPid,...base};
    // New loan with an initial rate entered directly — seed the rate
    // history so it's tracked from day one (matches how rate changes are
    // recorded later via "history").
    if(kind==='liability'&&base.interestRate){
      newItem.rateHistory=[{date:base.loanStartDate||todayISO(),rate:base.interestRate}];
    }
    DB.nw.items.push(newItem);
  }
  save();closeModal();render();toast('Item saved');
}
function nwEntryAdd(itemId,prefill,prefillDate){
  const it=DB.nw.items.find(x=>x.id===itemId);
  const last=nwEntriesOf(itemId).slice(-1)[0];
  const v=prefill!=null?prefill:(last?last.value:'');
  const isShare=it.kind==='share';
  const unit=isShare&&it.qty&&v!==''?(num(v)/num(it.qty)).toFixed(3):'';
  const asset=it.assetId?DB.assets.find(a=>a.id===it.assetId):null;
  const isPropertyVal=asset&&asset.kind==='property'&&asset.address;
  const wantsStatement=['super','savings','offset','liability'].includes(it.kind);
  modal(`New entry — ${esc(it.name)}`,`
    ${isPropertyVal?`<div class="hint" style="margin-bottom:10px">Property estimates aren't available via a free public API — but you can quickly check current estimates from realestate.com.au, Domain, or property.com.au and enter the figure below.<br><a class="btn small mt" href="https://www.google.com/search?q=${encodeURIComponent(asset.address+' property estimate value')}" target="_blank" rel="noopener">🔍 Check current estimates ↗</a></div>`:''}
    <div class="fldrow"><div><label class="fld">Date</label><input id="f_d" type="date" class="input" value="${prefillDate||todayISO()}"></div>
    ${isShare?`<div><label class="fld">Unit price ($)</label><input id="f_up" class="input money" value="${unit}" oninput="$('#f_v').value=(num(this.value)*${num(it.qty)||0}).toFixed(2)"></div>`:''}
    <div><label class="fld">${it.kind==='liability'?'Balance owing ($ — enter as negative)':'Value ($)'}</label><input id="f_v" class="input money" value="${v}"></div></div>
    ${isShare&&it.qty?`<div class="hint mt">${(+it.qty).toLocaleString()} units held — unit price × quantity fills the value for you.</div>`:''}
    ${isPropertyVal?`<div class="mt"><label class="fld">Source <span class="muted">(optional)</span></label><input id="f_src" class="input" placeholder="e.g. realestate.com.au estimate, bank valuation"></div>`:''}
    ${wantsStatement?`<div class="mt" style="border-top:1px solid var(--line);padding-top:14px">
      <label class="fld">Attach statement <span class="muted">(optional)</span></label>
      <div class="fldrow" style="margin-top:6px">
        <div style="flex:1"><input id="f_stmt_file" type="file" class="input" accept="image/*,.pdf" style="font-size:.82rem"></div>
        <div><select id="f_stmt_type" class="input" style="min-width:148px">
          <option value="monthly">Monthly statement</option>
          <option value="yearly">Yearly statement</option>
        </select></div>
      </div>
    </div>`:''}`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="nwEntrySave('${itemId}')">Save</button>`);
}
function nwEntrySave(itemId){
  const date=$('#f_d').value||todayISO();
  let v=num($('#f_v').value);
  const it=DB.nw.items.find(x=>x.id===itemId);
  if(!it)return toast('Item no longer exists — please close and try again');
  if(it.kind==='liability'&&v>0)v=-v;
  const source=$('#f_src')?$('#f_src').value.trim():'';
  const stmtFile=$('#f_stmt_file')?$('#f_stmt_file').files[0]:null;
  const stmtType=$('#f_stmt_type')?$('#f_stmt_type').value:'monthly';
  const ex=DB.nw.entries.find(e=>e.itemId===itemId&&e.date===date);
  const entry=ex||{id:uid(),itemId,date};
  entry.value=v;
  if(source)entry.source=source;else delete entry.source;
  if(!ex)DB.nw.entries.push(entry);
  save();closeModal();render();
  // Attach statement if a file was provided
  if(stmtFile){
    const rid=entry.receiptId||uid();
    const oldRid=entry.receiptId;
    entry.receiptId=rid;entry.receiptName=stmtFile.name;entry.receiptStatementType=stmtType;
    save();
    const kindLabels={super:'Superannuation',savings:'Savings',offset:'Offset account',liability:'Loan'};
    toast('Attaching statement…');
    rcptPut({id:rid,name:stmtFile.name,type:stmtFile.type,blob:stmtFile},
      {fy:'all',category:'Statements',date,itemName:`${it.name} — ${stmtType==='yearly'?'yearly':'monthly'} statement`,pid:it.pid||DB.currentPid}
    ).then(()=>{
      if(oldRid&&oldRid!==rid&&!receiptStillReferenced(oldRid))rcptDel(oldRid).catch(()=>{});
      toast('Statement attached');render();
    }).catch(()=>toast("Couldn't attach statement — try again"));
  }
  // Loan follow-up prompt — only if no file is being attached (otherwise
  // the modal would open mid-upload and confuse the user)
  const offsetItem=it.kind==='liability'&&it.offsetItemId&&!stmtFile
    ?DB.nw.items.find(x=>x.id===it.offsetItemId):null;
  if(offsetItem){
    modal('Update linked offset too?',`
      <p>You just updated <b>${esc(it.name)}</b>'s balance. It has a linked offset account — <b>${esc(offsetItem.name)}</b> — want to update that balance too while you're here?</p>`,
      `<button class="btn" data-close>Not now</button><button class="btn primary" onclick="nwEntryAdd('${offsetItem.id}',null,'${date}')">Update offset balance</button>`);
  }else if(!stmtFile){
    toast('Entry saved');
  }
}
function nwHistory(itemId){
  const it=DB.nw.items.find(x=>x.id===itemId);
  const es=nwEntriesOf(itemId);
  const pts=es.map(e=>({label:fmtDate(e.date),value:e.value}));
  const stmtTypeLabel=t=>t==='yearly'?'Yearly statement':'Monthly statement';
  modal(`History — ${esc(it.name)}`,`
    ${pts.length>1?lineChartSVG(pts,{aria:'Item history'}):''}
    <table class="tbl mt"><thead><tr><th>Date</th><th class="num">Value</th><th></th></tr></thead><tbody>
    ${es.slice().reverse().map(e=>`<tr><td>${fmtDate(e.date)}${e.source?`<div class="muted" style="font-size:.74rem">${esc(e.source)}</div>`:''}
      ${e.receiptId?`<div style="margin-top:4px"><span class="rcpt-file" style="font-size:.74rem" onclick="rcptView('${e.receiptId}','${esc(e.receiptName||'statement')}')" title="${esc(e.receiptName||'statement')}">📎 ${esc(stmtTypeLabel(e.receiptStatementType))}</span></div>`:''}</td>
      <td class="num">${fmt$(e.value)}</td>
      <td class="rowact"><button class="btn ghost small" onclick="nwEntryDelete('${e.id}','${itemId}')">✕</button></td></tr>`).join('')
      ||'<tr><td colspan="3" class="muted">No entries yet.</td></tr>'}</tbody></table>`);
}
function nwEntryDelete(entryId,itemId){
  const e=DB.nw.entries.find(x=>x.id===entryId);
  const rid=e?.receiptId;
  DB.nw.entries=DB.nw.entries.filter(x=>x.id!==entryId);
  if(rid&&!receiptStillReferenced(rid))rcptDel(rid).catch(()=>{});
  save();closeModal();render();
}
function nwLoanDetail(loanId){
  const loan=DB.nw.items.find(x=>x.id===loanId);if(!loan)return;
  const offsetItem=loan.offsetItemId?DB.nw.items.find(x=>x.id===loan.offsetItemId):null;
  const loanEs=nwEntriesOf(loanId);
  const offsetEs=offsetItem?nwEntriesOf(offsetItem.id):[];
  const today2=todayISO();
  const allKeys=[...new Set([...loanEs,...offsetEs].map(e=>e.date.slice(0,7)))].sort();
  if(!allKeys.length){
    modal('Loan history',`<p class="muted">No entries yet — add entries to see monthly interest estimates.</p>`);
    return;
  }
  const pts=[];let [yy,mm]=(allKeys[0]+'-01').split('-').map(Number);
  while(`${yy}-${String(mm).padStart(2,'0')}`<=today2.slice(0,7)){
    const eom=iso(new Date(Date.UTC(yy,mm,0)));const cut=eom<today2?eom:today2;
    const lb=nwValueAt(loanId,cut);
    if(lb!=null){
      const ob=offsetItem?nwValueAt(offsetItem.id,cut):null;
      const lbal=Math.abs(lb),obal=ob!=null?Math.max(0,ob):0;
      const eff=Math.max(0,lbal-obal);
      const mo=eff*(loanRateAt(loan,cut)||0)/100/12;
      const label=new Date(Date.UTC(yy,mm-1,1)).toLocaleString('en-AU',{month:'short',timeZone:'UTC'})+' '+String(yy).slice(2);
      pts.push({label,value:mo,lbal,obal,eff,mo});
    }
    mm++;if(mm>12){mm=1;yy++;}
  }
  const total=pts.reduce((s,p)=>s+p.value,0);
  const tRows=pts.slice().reverse().map(p=>`<tr>
    <td>${p.label}</td><td class="num">${fmt$(p.lbal)}</td>
    <td class="num">${p.obal>0?`<span style="color:var(--euc)">${fmt$(p.obal)}</span>`:'<span class="muted">—</span>'}</td>
    <td class="num">${fmt$(p.eff)}</td>
    <td class="num" style="color:var(--gold)"><b>${fmt$(p.mo)}</b></td></tr>`).join('');
  modal(`Loan interest history — ${esc(loan.name)}`,`
    ${pts.length>1?lineChartSVG(pts,{aria:'Monthly interest estimate'}):''}
    <table class="tbl mt" style="font-size:.84rem"><thead><tr>
      <th>Month</th><th class="num">Loan balance</th><th class="num">Offset</th>
      <th class="num">Effective</th><th class="num">Est. interest</th></tr></thead>
    <tbody>${tRows}
      <tr class="total"><td colspan="4">Total interest estimate (tracked period)</td><td class="num">${fmt$(total)}</td></tr>
    </tbody></table>
    <div class="note">Estimates based on recorded balances at the rate in effect each month ÷ 12. Your lender calculates on daily balances — use these figures for planning, not for reconciliation.</div>`);
}
async function nwFetchPrice(itemId){
  const it=DB.nw.items.find(x=>x.id===itemId);
  if(!it)return;
  toast('Fetching '+it.code+'…');
  const q=await fetchAsxPrice(it.code);
  if(!q)return toast('Couldn\u2019t fetch a live price (browser blocked it) — add the entry manually');
  const val=it.qty?q.price*num(it.qty):q.price;
  nwEntryAdd(itemId,val.toFixed(2));
  toast(`${it.code} ${fmt$(q.price)} via ${q.source}`);
}
function nwSnapshot(){
  const pids=isAll()?DB.people.map(p=>p.id):[DB.currentPid];
  const items=nwItemsFor(pids);
  if(!items.length)return toast('Add items first');
  const flds=items.map(it=>{
    const last=nwEntriesOf(it.id).slice(-1)[0];
    return `<div class="kv"><span class="k">${esc(it.name)}${it.code?' ('+esc(it.code)+')':''}</span>
      <span style="width:150px"><input class="input money nwsnap" data-id="${it.id}" value="${last?last.value:''}"></span></div>`;
  }).join('');
  modal('Take a snapshot',`
    <div class="fldrow"><div><label class="fld">Snapshot date</label><input id="f_d" type="date" class="input" value="${todayISO()}"></div></div>
    <div class="mt">${flds}</div>
    <div class="note" style="margin-top:10px"><b>What is this?</b> Each tracked item in Net Worth builds its history from individual value entries — the timeline graph and month-on-month change are driven entirely by those entries. This snapshot button is simply a <i>shortcut</i> to add or update entries for all your items at once, using a single shared date. Nothing is stored differently from the "+" entry button on each row — it just saves you clicking each one separately.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="nwSnapshotSave()">Save snapshot</button>`);
}
function nwSnapshotSave(){
  const date=$('#f_d').value||todayISO();
  let n=0;
  $$('.nwsnap').forEach(inp=>{
    if(inp.value==='')return;
    const itemId=inp.dataset.id;
    let v=num(inp.value);
    const it=DB.nw.items.find(x=>x.id===itemId);
    if(!it)return;
    if(it.kind==='liability'&&v>0)v=-v;
    const ex=DB.nw.entries.find(e=>e.itemId===itemId&&e.date===date);
    if(ex)ex.value=v;else DB.nw.entries.push({id:uid(),itemId,date,value:v});
    n++;
  });
  save();closeModal();render();toast(n+' values recorded for '+fmtDate(date));
}

/* ================= ASSETS — FY-independent register ================= */
function assetCostSchedule(asset,cost){
  // Spread a purchase/borrowing cost across FYs. ATO: borrowing expenses over $100
  // are claimed over 5 years (or the loan term if shorter), apportioned by days in year 1.
  const years=Math.max(1,num(cost.spreadYears)||1);
  const amount=num(cost.amount);
  if(!cost.date||!amount)return [];
  const startFY=fyStartYearOf(cost.date);
  if(years===1)return [{fy:startFY,amount}];
  const totalDays=Math.round(years*365.25);
  const out=[];
  let claimed=0;
  const purchase=new Date(cost.date+'T00:00:00Z');
  for(let k=0;k<=years;k++){
    const fy=startFY+k;
    const fyStart=new Date(Date.UTC(fy,6,1));
    const fyEnd=new Date(Date.UTC(fy+1,5,30));
    const from=k===0?purchase:fyStart;
    const to=new Date(Math.min(fyEnd.getTime(),purchase.getTime()+totalDays*86400000));
    if(to<from)break;
    const days=Math.round((to-from)/86400000)+1;
    let amt=amount*days/totalDays;
    if(k===years||claimed+amt>amount)amt=amount-claimed;
    if(amt<=0.005)break;
    out.push({fy,amount:Math.round(amt*100)/100});
    claimed+=amt;
  }
  return out;
}
PAGES.assetDetail=m=>{
  const a=DB.assets.find(x=>x.id===ASSET_DETAIL_ID);
  if(!a){
    m.insertAdjacentHTML('beforeend','<div class="card"><div class="cbody"><p class="muted">Asset not found — it may have been deleted.</p><button class="btn mt" onclick="go(\'assets\')">← Back to Assets</button></div></div>');
    return;
  }
  const scoped=!isAllFY();
  const range=scoped?fyRange(FY()):null;
  const emoji=a.kind==='shares'?'📈':a.kind==='managed_fund'?'📊':a.kind==='vehicle'?'🚗':a.kind==='property'?'🏠':a.kind==='ff_points'?'✈️':'📦';
  head(m,`${emoji} ${esc(a.name)}`,`Details — ${scoped?esc(fyDisplay(FY())):'all time'}${a.code?` · ${esc(a.code)}`:''}`,
    `<button class="btn" onclick="go('assets')">← Back to Assets</button>`);

  if(a.kind==='shares'||a.kind==='managed_fund'){
    const pid=a.pid||DB.people[0].id;
    const allTxs=(a.transactions||[]).filter(t=>t.date).slice().sort((x,y)=>x.date<y.date?-1:1);
    const txs=scoped?allTxs.filter(t=>t.date>=range.start&&t.date<=range.end):allTxs;
    // Units held over time — cumulative, one point per transaction date
    // (assetHeldQty is checkpoint-aware, so dividend-statement-synced
    // checkpoints show up correctly here even without full buy/sell history)
    const unitPts=txs.map(t=>({label:fmtDate(t.date),value:assetHeldQty(a,t.date)}));
    // Cost basis over time — cumulative invested capital (not market value;
    // there's no historical price feed, just the latest known price).
    // Checkpoints carry a unit count, not cost data, so skip them here.
    const costTxs=txs.filter(t=>t.type!=='checkpoint');
    let runQty=0,runCost=0;
    const costPts=costTxs.map(t=>{
      const qty=num(t.qty),price=num(t.price),fees=num(t.fees||0);
      if(t.type==='sell'){const avg=runQty?runCost/runQty:0;runCost-=avg*qty;runQty-=qty;}
      else{runCost+=qty*price+fees;runQty+=qty;}
      return{label:fmtDate(t.date),value:Math.max(0,runCost)};
    });
    let allDivs=[];
    Object.values(DB.years).forEach(y=>{
      bucket(y,pid).dividends.filter(d=>d.assetId===a.id||(a.code&&d.code===a.code)).forEach(d=>allDivs.push(d));
    });
    allDivs.sort((x,y)=>x.date<y.date?-1:1);
    const divs=scoped?allDivs.filter(d=>d.date>=range.start&&d.date<=range.end):allDivs;
    const divPts=divs.map(d=>({label:fmtDate(d.date),value:num(d.payment)}));
    const divQtyRows=divs.filter(d=>d.qty).map(d=>`<tr><td>${fmtDate(d.date)}</td><td class="num">${(+d.qty).toLocaleString()}</td><td class="num">${assetHeldQty(a,d.date).toLocaleString()}</td></tr>`).join('');
    const allPriceHist=(a.priceHistory||[]).slice().sort((x,y)=>x.date<y.date?-1:1);
    const priceHist=scoped?allPriceHist.filter(h=>h.date>=range.start&&h.date<=range.end):allPriceHist;
    const pricePts=priceHist.map(h=>({label:fmtDate(h.date),value:num(h.price)}));
    const curVal=assetCurrentValue(a);
    // Combined table — price, units held, and total value side by side so
    // growth can be split into "price went up" vs "I bought more units".
    const combinedRows=priceHist.map(h=>{
      const qtyAt=assetHeldQty(a,h.date);
      return `<tr><td>${fmtDate(h.date)}</td><td class="num">${fmt$(h.price)}</td><td class="num">${(+qtyAt).toLocaleString()}</td><td class="num">${fmt$0(num(h.price)*qtyAt)}</td></tr>`;
    }).join('');
    m.insertAdjacentHTML('beforeend',`
    <div class="grid3" style="margin-bottom:14px">
      <div class="stat"><div class="l">Units held now</div><div class="v">${(+assetHeldQty(a)).toLocaleString()}</div></div>
      <div class="stat"><div class="l">Market value now</div><div class="v" style="font-size:1.1rem">${curVal!=null?fmt$0(curVal):'—'}</div><div class="d">${a.lastPrice?'at '+fmtDate(a.lastPrice.date):'no price set'}</div></div>
      <div class="stat"><div class="l">Dividends ${scoped?'this FY':'all time'}</div><div class="v" style="font-size:1.1rem">${fmt$0(divs.reduce((s,d)=>s+num(d.payment),0))}</div></div>
    </div>
    <div class="card"><div class="chead"><h2>Price over time</h2><span class="hint">one point per day a live price was fetched — automatic once daily, or use ↻ on the asset card anytime</span></div><div class="cbody">
      ${pricePts.length>1?lineChartSVG(pricePts,{aria:'Unit price over time'}):'<div class="muted">Not enough price history yet in this period — fetch a live price (or wait for tomorrow\u2019s automatic refresh) to start building this up.</div>'}
    </div></div>
    ${combinedRows?`<div class="card"><div class="chead"><h2>Price vs units held</h2><span class="hint">see how much of your value change came from price vs buying more</span></div><div class="cbody tight"><table class="tbl">
      <thead><tr><th>Date</th><th class="num">Price</th><th class="num">Units held</th><th class="num">Value</th></tr></thead><tbody>${combinedRows}</tbody></table></div></div>`:''}
    <div class="card"><div class="chead"><h2>Units held over time</h2></div><div class="cbody">
      ${unitPts.length?lineChartSVG(unitPts,{aria:'Units held over time',valueFmt:v=>(+v).toLocaleString()+' units',chartFmt:v=>(+v).toLocaleString()}):'<div class="muted">No transactions in this period.</div>'}
    </div></div>
    ${divQtyRows?`<div class="card"><div class="chead"><h2>Units per dividend statement <span class="hint">these set checkpoints below, keeping units held accurate even with incomplete buy/sell history</span></h2></div><div class="cbody tight"><table class="tbl">
      <thead><tr><th>Date</th><th class="num">Units per statement</th><th class="num">Units from transactions</th></tr></thead><tbody>${divQtyRows}</tbody></table></div></div>`:''}
    <div class="card"><div class="chead"><h2>Cost basis over time</h2><span class="hint">cumulative invested capital — what you paid in, not market value (see Price over time above for that)</span></div><div class="cbody">
      ${costPts.length?lineChartSVG(costPts,{aria:'Cost basis over time'}):'<div class="muted">No transactions in this period.</div>'}
    </div></div>
    <div class="card"><div class="chead"><h2>Dividends over time</h2></div><div class="cbody">
      ${divPts.length?barChartSVG(divPts,{aria:'Dividends over time'}):'<div class="muted">No dividends in this period.</div>'}
    </div></div>`);
  }else if(a.kind==='property'||a.kind==='vehicle'){
    const valItem=DB.nw.items.find(it=>it.assetId===a.id&&it.kind==='asset');
    const allEntries=valItem?nwEntriesOf(valItem.id).slice().sort((x,y)=>x.date<y.date?-1:1):[];
    const entries=scoped?allEntries.filter(e=>e.date>=range.start&&e.date<=range.end):allEntries;
    const valPts=entries.map(e=>({label:fmtDate(e.date),value:num(e.value)}));
    const latest=allEntries.length?allEntries[allEntries.length-1]:null;
    let rentPts=[];
    if(a.kind==='property'){
      const years=scoped?[FY()]:Object.values(DB.years).sort((x,y)=>fyOrderYear(x)-fyOrderYear(y));
      years.forEach(y=>{
        const inc=rentalIncomeEffective(a,y);
        if(inc||years.length<=2)rentPts.push({label:fyDisplay(y),value:inc});
      });
    }
    m.insertAdjacentHTML('beforeend',`
    <div class="grid3" style="margin-bottom:14px">
      <div class="stat"><div class="l">Latest valuation</div><div class="v" style="font-size:1.1rem">${latest?fmt$0(latest.value):'—'}</div><div class="d">${latest?'at '+fmtDate(latest.date):'not tracked yet'}</div></div>
      <div class="stat"><div class="l">Purchased</div><div class="v" style="font-size:1.1rem">${a.purchaseDate?fmtDate(a.purchaseDate):'—'}</div><div class="d">${a.purchasePrice?'for '+fmt$0(a.purchasePrice):''}</div></div>
      <div class="stat"><div class="l">Growth since purchase</div><div class="v" style="font-size:1.1rem">${latest&&a.purchasePrice?fmt$0(latest.value-a.purchasePrice):'—'}</div></div>
    </div>
    <div class="card"><div class="chead"><h2>Value over time</h2></div><div class="cbody">
      ${valPts.length>1?lineChartSVG(valPts,{aria:'Valuation over time'}):'<div class="muted">Not enough valuation entries yet in this period — log them via Net worth.</div>'}
    </div></div>
    ${a.kind==='property'?`<div class="card"><div class="chead"><h2>Rental income ${scoped?'':'by financial year'}</h2></div><div class="cbody">
      ${rentPts.length?barChartSVG(rentPts,{aria:'Rental income over time'}):'<div class="muted">No rental income recorded.</div>'}
    </div></div>`:''}`);
  }else{
    m.insertAdjacentHTML('beforeend','<div class="card"><div class="cbody"><p class="muted">Detailed history charts aren\'t available for this asset type yet.</p></div></div>');
  }
};
function assetSearchInput(q){
  const el=document.getElementById('assetSearchResults');
  if(!el)return;
  q=q.trim().toLowerCase();
  if(!q){el.innerHTML='';return;}
  const pids=isAll()?DB.people.map(p=>p.id):[DB.currentPid];
  const assetMatches=assetsForPerson(pids).filter(a=>
    a.name.toLowerCase().includes(q)||(a.code||'').toLowerCase().includes(q)||(a.address||'').toLowerCase().includes(q)
  );
  // Also search NW items (loans, savings, offset, super, shares)
  const nwMatches=(DB.nw?.items||[]).filter(it=>
    pids.includes(it.pid)&&(it.name.toLowerCase().includes(q)||(it.code||'').toLowerCase().includes(q))
  );
  const allMatches=[
    ...assetMatches.map(a=>({type:'asset',id:a.id,name:a.name,code:a.code,emoji:a.kind==='shares'?'📈':a.kind==='managed_fund'?'📊':a.kind==='vehicle'?'🚗':a.kind==='property'?'🏠':a.kind==='ff_points'?'✈️':'📦',sub:''})),
    ...nwMatches.map(it=>({type:'nw',id:it.id,name:it.name,code:it.code,emoji:{super:'🏦',savings:'💰',offset:'🏦',liability:'🏦',share:'📈',asset:'📦'}[it.kind]||'📦',sub:({super:'Superannuation',savings:'Savings account',offset:'Offset account',liability:'Loan',share:'Shares',asset:'Asset'})[it.kind]||it.kind})),
  ].slice(0,10);
  if(!allMatches.length){el.innerHTML='<div class="asset-search-dropdown"><div class="muted" style="padding:8px 10px;font-size:.82rem">No matches</div></div>';return;}
  el.innerHTML=`<div class="asset-search-dropdown">${allMatches.map(item=>{
    const subLabel=item.sub?` <span class="muted" style="font-size:.75rem">${esc(item.sub)}</span>`:'';
    const codeLabel=item.code?` <span class="muted">${esc(item.code)}</span>`:'';
    const onclick=item.type==='asset'?`assetSearchPick('${item.id}')`:`nwSearchPick('${item.id}')`;
    return `<div class="asset-search-item" onclick="${onclick}">${item.emoji} ${esc(item.name)}${codeLabel}${subLabel}</div>`;
  }).join('')}</div>`;
}
function nwSearchPick(id){
  document.getElementById('assetSearchInput').value='';
  document.getElementById('assetSearchResults').innerHTML='';
  // Navigate to net worth page and open the history for this item
  go('networth');
  setTimeout(()=>nwHistory(id),150);
  if(window.innerWidth<=1000)navSetOpen(false);
}
function assetSearchPick(id){
  document.getElementById('assetSearchInput').value='';
  document.getElementById('assetSearchResults').innerHTML='';
  assetDetailOpen(id);
  if(window.innerWidth<=1000)navSetOpen(false);
}
let ASSET_DETAIL_ID=null;
function assetDetailOpen(id){
  ASSET_DETAIL_ID=id;
  currentPage='assetDetail';
  $$('#nav button').forEach(b=>b.classList.remove('active'));
  render();
}
let NW_CAT_COLLAPSED=new Set(); // net worth category keys collapsed by the user, transient — starts all-expanded
function nwCatToggle(key){
  if(NW_CAT_COLLAPSED.has(key))NW_CAT_COLLAPSED.delete(key);else NW_CAT_COLLAPSED.add(key);
  render();
}
let ASSET_DEP_EXPANDED=new Set(); // asset ids with the depreciation schedule expanded, transient
let ASSET_SELECTED=new Set(); // ids of assets ticked for bulk delete, transient
let ASSET_GROUP_COLLAPSED=new Set(); // kinds currently collapsed, transient
const ASSET_GROUPS=[
  ['shares','📈 Shares'],
  ['managed_fund','📊 ETFs & Managed Funds'],
  ['property','🏠 Investment Properties'],
  ['vehicle','🚗 Vehicles'],
  ['ff_points','✈️ Frequent Flyer Points'],
  ['other','📦 Other assets'],
];
function assetGroupKind(a){return ASSET_GROUPS.some(([k])=>k===a.kind)?a.kind:'other';}
function assetGroupToggle(kind){if(ASSET_GROUP_COLLAPSED.has(kind))ASSET_GROUP_COLLAPSED.delete(kind);else ASSET_GROUP_COLLAPSED.add(kind);render();}
function assetGroupSection(kind,label,assets){
  if(!assets.length)return '';
  const collapsed=ASSET_GROUP_COLLAPSED.has(kind);
  const selCount=assets.filter(a=>ASSET_SELECTED.has(a.id)).length;
  const allSel=selCount===assets.length,noneSel=selCount===0;
  const ids=assets.map(a=>a.id);
  const checkboxHtml=isAll()?'':`<input type="checkbox" ${allSel?'checked':''} onclick="event.stopPropagation()" onchange='assetGroupSelectAll(${JSON.stringify(ids)},this.checked)' title="Select all ${esc(label)}" id="grpchk-${kind}" style="margin-right:2px">`;
  return `<div class="asset-group">
    <div class="asset-group-head" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 4px;font-weight:700;font-size:.95rem" onclick="assetGroupToggle('${kind}')">
      ${checkboxHtml}<span style="display:inline-block;width:1em">${collapsed?'▸':'▾'}</span><span>${esc(label)}</span><span class="muted" style="font-weight:400;font-size:.82rem">(${assets.length}${selCount?`, ${selCount} selected`:''})</span>
    </div>
    ${collapsed?'':assets.map(a=>assetCard(a)).join('')}
  </div>`;
}
/* ---- Asset acquisition date + FY visibility ---- */
/* Returns the date the asset was first acquired/entered — used to hide
   assets from FY views that pre-date their acquisition. Returns null for
   assets with no date info (always shown, for backwards compatibility). */
function assetAcquiredDate(a){
  if(a.kind==='property'||a.kind==='vehicle')return a.purchaseDate||null;
  if(a.kind==='shares'||a.kind==='managed_fund'){
    // Use the earliest dated non-base transaction as the acquisition date.
    const dated=(a.transactions||[]).filter(t=>t.date&&t.type!=='base'&&t.type!=='checkpoint')
      .map(t=>t.date).sort();
    return dated[0]||null;
  }
  if(a.kind==='ff_points'){
    const dated=(a.pointsLog||[]).filter(e=>e.date).map(e=>e.date).sort();
    return dated[0]||null;
  }
  return a.acquiredDate||null; // 'other' type uses explicit field
}
/* True if this asset existed at any point during or before the given FY,
   and (if it's been closed/archived) hadn't yet been closed before this
   FY started — so closing an asset never rewrites history: it just stops
   appearing in FYs after the one it was closed in. */
function assetVisibleInFY(a,y){
  const d=assetAcquiredDate(a);
  if(d&&d>fyRange(y).end)return false; // acquired after this FY
  if(a.closedDate&&a.closedDate<fyRange(y).start)return false; // closed before this FY started
  return true;
}
function assetClosePosition(assetId){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const isShare=a.kind==='shares'||a.kind==='managed_fund';
  const heldQty=isShare?assetHeldQty(a):null;
  const stillHolding=isShare&&heldQty>0;
  modal(`Close position — ${esc(a.name)}`,`
    <div class="hint">Closing a position archives it going forward — it stops showing up in financial years after the date below, while every record up to and including that year stays exactly as it was. This never rewrites history.</div>
    ${stillHolding?`<div class="note" style="margin-top:8px">You still hold <b>${(+heldQty).toLocaleString()}</b> units according to your transaction history. Log the sale first so your capital gain/loss is recorded — then come back here to close the position.</div>`:''}
    <div class="fldrow mt"><div><label class="fld">Closed / disposed of as of</label><input id="f_close" type="date" class="input" value="${a.closedDate||todayISO()}"></div></div>`,
    `<button class="btn" data-close>Cancel</button>
     ${stillHolding?`<button class="btn" onclick="closeModal();assetTxAdd('${assetId}')">Log sale first</button>`:''}
     <button class="btn primary" onclick="assetClosePositionSave('${assetId}')">Close position</button>`);
}
function assetClosePositionSave(assetId){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return toast('Asset not found');
  a.closedDate=$('#f_close').value||todayISO();
  // The daily auto-refresh skips closed assets from here on, so without
  // this, the linked 'holding' NW item's last pre-closure value would
  // silently keep counting toward net worth in every future month. Record
  // a definitive $0 at the closure date (units are guaranteed 0 by now).
  const nwItem=DB.nw.items.find(it=>it.assetId===assetId&&it.kind==='holding');
  if(nwItem){
    const ex=DB.nw.entries.find(e=>e.itemId===nwItem.id&&e.date===a.closedDate);
    if(ex)ex.value=0;else DB.nw.entries.push({id:uid(),itemId:nwItem.id,date:a.closedDate,value:0});
  }
  save();closeModal();render();
  toast(`${esc(a.name)} closed as of ${fmtDate(a.closedDate)} — hidden from later financial years, untouched in earlier ones`);
}
function assetReopenPosition(assetId){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return toast('Asset not found');
  delete a.closedDate;
  save();render();toast(`${esc(a.name)} reopened`);
}
PAGES.assets=m=>{
  const viewY=isAllFY()?null:FY();
  const pids=isAll()?DB.people.map(p=>p.id):[DB.currentPid];
  const allAssets=assetsForPerson(pids);
  const myAssets=viewY?allAssets.filter(a=>assetVisibleInFY(a,viewY)):allAssets;
  const hiddenCount=allAssets.length-myAssets.length;
  ASSET_SELECTED=new Set([...ASSET_SELECTED].filter(id=>myAssets.some(a=>a.id===id)));
  head(m,isAll()?'Household assets':'Assets',
    viewY
      ?`Assets active during <b>${esc(fyDisplay(viewY))}</b>${hiddenCount?` · <span class="muted">${hiddenCount} hidden (acquired later, or closed before this FY)</span>`:''} · <span class="muted">switch to "All time" above to see everything</span>`
      :`Everything you've ever held, regardless of financial year.`,
    isAll()?'':`${ASSET_SELECTED.size?`<button class="btn danger" onclick="assetDeleteSelected()">🗑 Delete ${ASSET_SELECTED.size} selected</button>`:''}<button class="btn primary" onclick="assetAdd()">+ Add asset</button>`);
  if(!myAssets.length){
    const emptyMsg=hiddenCount
      ? `Nothing active during ${esc(fyDisplay(viewY))} — ${hiddenCount} asset${hiddenCount>1?'s are':' is'} hidden (acquired later, or closed before this FY). Switch to "All time" above to see everything.`
      : 'Nothing here yet. Add your investment property, shares, vehicles or other assets to track valuations, expenses, and cost spreads.';
    m.insertAdjacentHTML('beforeend',`<div class="card"><div class="cbody"><p class="muted">${emptyMsg}</p></div></div>`);
    if(isAll())return;
    return;
  }
  // Group by type — only show assets visible in the selected scope
  m.insertAdjacentHTML('beforeend',ASSET_GROUPS.map(([kind,label])=>assetGroupSection(kind,label,myAssets.filter(a=>assetGroupKind(a)===kind))).join(''));
  m.insertAdjacentHTML('beforeend',`<div class="note">${viewY?`Showing assets active during ${esc(fyDisplay(viewY))}.`:`Showing every asset across all time.`} Acquisition date comes from purchase date (property/vehicle), first transaction (shares), or the "Acquired" field (other). Use <b>Close position</b> on an asset to archive it from a given date forward without touching its history in earlier financial years.</div>`);
  setTimeout(()=>{
    ASSET_GROUPS.forEach(([kind])=>{
      const cb=document.getElementById('grpchk-'+kind);
      if(!cb)return;
      const groupAssets=myAssets.filter(a=>assetGroupKind(a)===kind);
      const selCount=groupAssets.filter(a=>ASSET_SELECTED.has(a.id)).length;
      cb.indeterminate=selCount>0&&selCount<groupAssets.length;
    });
  },30);
};
/* ---- Share / ETF / Managed fund asset card ---- */
function assetShareCard(a){
  const pid=a.pid||DB.people[0].id;
  const pp=person(pid);
  const txs=(a.transactions||[]).slice().sort((x,y)=>x.date<y.date?-1:1);
  const heldQty=assetHeldQty(a);
  const costBasis=assetCostBasis(a);
  const lastP=a.lastPrice;
  const curVal=assetCurrentValue(a);
  const gainLoss=curVal!=null?curVal-costBasis:null;
  const gainPct=costBasis>0&&gainLoss!=null?gainLoss/costBasis*100:null;

  // Daily contributions for the bar chart (buy amounts per month)
  const buysByMonth=FY_MONTHS.map(l=>({label:l,value:0}));
  txs.filter(t=>t.type==='buy'||t.type==='drp').forEach(t=>{
    const fyStart=fyOrderYear(FY());
    const d=new Date(t.date+'T00:00:00Z');
    if(d.getUTCFullYear()===fyStart||(d.getUTCFullYear()===fyStart+1&&d.getUTCMonth()<6)){
      buysByMonth[monthIndexFY(t.date)].value+=num(t.qty)*num(t.price);
    }
  });
  const hasFYBuys=buysByMonth.some(m=>m.value>0);

  // Linked dividends / fund distributions for this asset (across current FY + all FYs)
  const linkedDivs=[];const linkedFP=[];
  Object.values(DB.years).forEach(y=>{
    bucket(y,pid).dividends.filter(d=>d.assetId===a.id).forEach(d=>linkedDivs.push({...d,fyLabel:fyDisplay(y)}));
    (bucket(y,pid).fundPayments||[]).filter(p=>p.assetId===a.id).forEach(p=>linkedFP.push({...p,fyLabel:fyDisplay(y)}));
  });

  const tRows=txs.map((t,i)=>{
    const isBase=t.type==='base';
    const isCheckpoint=t.type==='checkpoint';
    if(isCheckpoint){
      return `<tr>
    <td><span class="badge gold">CHECKPOINT</span></td>
    <td>${fmtDate(t.date)}</td>
    <td class="num">${(+t.qty).toLocaleString()}</td>
    <td class="num"><span class="muted">—</span></td>
    <td class="num"><span class="muted">—</span></td>
    <td class="num"><span class="muted">—</span></td>
    <td class="rowact">${isAll()?'':`<button class="btn ghost small" onclick="confirmDel('Remove this checkpoint? Units held will be calculated from buy/sell transactions only.',()=>{DB.assets.find(x=>x.id==='${a.id}').transactions.splice(${i},1);save();render()})">✕</button>`}</td></tr>`;
    }
    return `<tr>
    <td><span class="badge ${t.type==='sell'?'red':t.type==='drp'?'purple':isBase?'':'blue'}" ${isBase?'style="color:var(--muted);border-color:var(--line2)"':''}>${isBase?'OPENING':t.type.toUpperCase()}</span></td>
    <td>${isBase?'<span class="muted">— (opening position)</span>':fmtDate(t.date)}</td>
    <td class="num">${(+t.qty).toLocaleString()}</td>
    <td class="num">${fmt$(t.price)}</td>
    <td class="num">${fmt$(t.fees||0)}</td>
    <td class="num">${t.type==='sell'?`<span style="color:var(--red)">${fmt$(num(t.qty)*num(t.price))}</span>`:fmt$(num(t.qty)*num(t.price)+num(t.fees))}</td>
    <td class="rowact">${isAll()?'':isBase?
      `<button class="btn ghost small" onclick="assetBaseAdd('${a.id}')">Edit</button>`:
      `<button class="btn ghost small" onclick="assetTxAdd('${a.id}',${i})">Edit</button>
      <button class="btn ghost small" onclick="assetTxDelete('${a.id}',${i})">✕</button>`}</td></tr>`;
  }).join('');

  return `<div class="card${a.closedDate?' archived':''}"><div class="chead">
    <h2>${isAll()?'':`<input type="checkbox" ${ASSET_SELECTED.has(a.id)?'checked':''} onchange="assetToggleSelect('${a.id}',this.checked)" title="Select for bulk delete" style="margin-right:6px;vertical-align:middle">`}${isAll()?pdot(pp)+' ':''}${a.kind==='managed_fund'?'📊':'📈'} ${esc(a.name)}${a.code?` <span class="badge blue">${esc(a.code)}</span>`:''}${a.platform?` <span class="badge" style="color:var(--muted);border-color:var(--line2)">${esc(a.platform)}</span>`:''}${a.closedDate?` <span class="badge gold">closed ${fmtDate(a.closedDate)}</span>`:''}</h2>
    <span class="actions">
      ${lastP?`<span class="hint">${fmt$(lastP.price)}/unit via ${esc(lastP.source)} at ${fmtDate(lastP.date)}</span>`:''}
      ${a.code&&!isAll()?`<button class="btn small" onclick="assetFetchPrice('${a.id}')">↻ Live price</button>`:''}
      ${isAll()?'':`<button class="btn small ${(a.transactions||[]).some(t=>t.type==='base')?'ghost':''}" onclick="assetBaseAdd('${a.id}')">${(a.transactions||[]).some(t=>t.type==='base')?'Edit opening position':'📍 Set opening position'}</button>`}
      ${isAll()?'':`<button class="btn small" onclick="assetTxAdd('${a.id}')">+ Buy / Sell</button>`}
      ${isAll()?'':`<button class="btn small ghost" onclick="assetUpdatePosition('${a.id}')" title="Set new total units + average cost in one go, instead of logging each buy">↻ Update position</button>`}
      ${isAll()?'':a.closedDate?`<button class="btn small ghost" onclick="assetReopenPosition('${a.id}')">Reopen</button>`:`<button class="btn small ghost" onclick="assetClosePosition('${a.id}')">Close position</button>`}
      <button class="btn small ghost" onclick="assetDetailOpen('${a.id}')">📊 Details</button>
      <button class="btn small" onclick="assetAdd('${a.id}')">Edit</button>
      <button class="btn ghost small" onclick="confirmDel('Delete ${esc(a.name)}? This also deletes all its transactions, holdings, linked net worth items, and every dividend/distribution recorded against it across all financial years.',()=>assetDelete('${a.id}'))">✕</button>
    </span></div>
    <div class="cbody">
      <div class="grid3" style="gap:10px;margin-bottom:14px">
        <div class="stat"><div class="l">Units held</div><div class="v" style="font-size:1.2rem">${heldQty>0?(+heldQty).toLocaleString():'0'}</div><div class="d">${pdot(pp)} ${esc(pp.name)}</div></div>
        <div class="stat"><div class="l">Cost basis</div><div class="v" style="font-size:1.1rem">${fmt$0(costBasis)}</div><div class="d">avg ${heldQty?fmt$(costBasis/heldQty):fmt$(0)}/unit</div></div>
        <div class="stat ${gainLoss==null?'':gainLoss>=0?'good':'bad'}"><div class="l">Market value${lastP?'':" <span class='muted'>(no price)</span>"}</div>
          <div class="v" style="font-size:1.1rem">${curVal!=null?fmt$0(curVal):'—'}</div>
          <div class="d">${gainLoss!=null?(gainLoss>=0?'▲ ':'▼ ')+fmt$0(Math.abs(gainLoss))+(gainPct!=null?' ('+gainPct.toFixed(1)+'%)':''):'fetch a price to see P&L'}</div></div>
      </div>
      ${hasFYBuys?`<div style="margin-bottom:14px">${barChartSVG(buysByMonth,{aria:'Purchases this FY by month'})}<div class="hint" style="margin-top:4px">Buy value per month in ${esc(fyDisplay(FY()))} — click the code in the header to see all purchases</div></div>`:''}
      <h3 style="font-size:.9rem;font-weight:700;margin-bottom:8px">Transactions</h3>
      ${tRows?`<table class="tbl"><thead><tr><th>Type</th><th>Date</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Fees</th><th class="num">Total</th><th></th></tr></thead><tbody>${tRows}</tbody></table>`
        :`<div class="muted">No transactions yet — add a buy to start tracking this holding.</div>`}
      ${a.kind==='managed_fund'||a.kind==='shares'?`
      <h3 style="font-size:.9rem;font-weight:700;margin:14px 0 8px">Linked ${a.kind==='managed_fund'?'distributions':'dividends'} across all years</h3>
      ${(a.kind==='managed_fund'?linkedFP:linkedDivs).length
        ?`<table class="tbl" style="font-size:.84rem"><thead><tr><th>Date</th><th>FY</th><th class="num">Amount</th></tr></thead><tbody>
          ${(a.kind==='managed_fund'?linkedFP:linkedDivs).map(x=>`<tr><td>${fmtDate(x.date)}</td><td>${esc(x.fyLabel)}</td><td class="num">${fmt$(x.payment||x.amount)}</td></tr>`).join('')}
          </tbody></table>`
        :`<div class="muted">None yet — go to ${a.kind==='managed_fund'?`<a href="#" onclick="go('funds');return false">ETF / Managed Funds</a>`:`<a href="#" onclick="go('dividends');return false">Share Dividends</a>`} to link ${a.kind==='managed_fund'?'distributions':'dividends'} to this asset.</div>`}
      `:''}
    </div></div>`;
}
async function assetFetchPrice(assetId,opts){
  opts=opts||{};
  const a=DB.assets.find(x=>x.id===assetId);if(!a||!a.code)return false;
  if(!opts.silent)toast('Fetching '+a.code+'…');
  const q=await fetchAsxPrice(a.code);
  if(!q){if(!opts.silent)toast('Could not fetch live price — enter manually via ↻ price on Net Worth items');return false;}
  const today=todayISO();
  a.lastPrice={price:q.price,date:today,source:q.source};
  a.priceHistory=a.priceHistory||[];
  const exHist=a.priceHistory.find(h=>h.date===today);
  if(exHist){exHist.price=q.price;exHist.source=q.source;}
  else a.priceHistory.push({date:today,price:q.price,source:q.source});
  // Also record an NW entry for the asset's linked NW items (auto-creates the holding NW item if needed)
  const pid=a.pid||DB.people[0].id;
  let nwItem=DB.nw.items.find(it=>it.assetId===assetId&&it.kind==='holding');
  if(!nwItem){
    nwItem={id:uid(),pid,name:a.name+(a.code?' ('+a.code+')':''),kind:'holding',assetId};
    DB.nw.items.push(nwItem);
  }
  const val=q.price*assetHeldQty(a);
  const ex=DB.nw.entries.find(e=>e.itemId===nwItem.id&&e.date===today);
  if(ex)ex.value=val;else DB.nw.entries.push({id:uid(),itemId:nwItem.id,date:today,value:val});
  save();
  if(!opts.silent){render();toast(`${a.code}: ${fmt$(q.price)}/unit · total ${fmt$(val)} recorded`);}
  return true;
}
/* Once-per-day background price refresh for every share/managed fund
   holding with a ticker code — same "cheap no-op after the first run
   today" pattern as autoRefreshHolidays/snapshotIfNeeded. Builds up daily
   price history automatically, the same way version snapshots build up
   automatically, without the person needing to remember to click refresh. */
async function autoRefreshPrices(){
  const today=todayISO();
  if(DB._lastPriceFetchDate===today)return;
  DB._lastPriceFetchDate=today;
  const assets=DB.assets.filter(a=>(a.kind==='shares'||a.kind==='managed_fund')&&a.code&&!a.closedDate);
  if(!assets.length)return;
  let any=false;
  for(const a of assets){
    try{if(await assetFetchPrice(a.id,{silent:true}))any=true;}catch(e){}
  }
  if(any)render();
}
function assetBaseAdd(assetId){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const existing=(a.transactions||[]).find(t=>t.type==='base');
  const t=existing||{qty:'',price:''};
  modal(existing?'Edit opening position':'Set opening position',`
    <p class="muted" style="margin-bottom:12px;line-height:1.5">For holdings you've had a long time and don't want to dig up every historical buy for. Enter your <b>current total quantity</b> and <b>average cost per unit</b> as a single opening position — date-independent, and not counted in this FY's "purchases" chart. Any buys/sells you log from here on add to or subtract from this base.</p>
    <div class="fldrow">
      <div><label class="fld">Quantity / units held</label><input id="f_q" class="input money" value="${t.qty}"></div>
      <div><label class="fld">Average cost per unit ($)</label><input id="f_p2" class="input money" value="${t.price}"></div>
    </div>`,
    `<button class="btn" data-close>Cancel</button>${existing?`<button class="btn ghost" onclick="confirmDel('Remove the opening position? Buys/sells you\'ve logged will remain.',()=>{const a=DB.assets.find(x=>x.id==='${assetId}');a.transactions=a.transactions.filter(x=>x.type!=='base');save();closeModal();render()})">Remove</button>`:''}<button class="btn primary" onclick="assetBaseSave('${assetId}')">Save</button>`);
}
function assetBaseSave(assetId){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  if(!a.transactions)a.transactions=[];
  const qty=num($('#f_q').value),price=num($('#f_p2').value);
  let t=a.transactions.find(x=>x.type==='base');
  if(t){t.qty=qty;t.price=price;}
  else a.transactions.push({id:uid(),type:'base',date:'2000-01-01',qty,price,fees:0});
  save();closeModal();render();toast('Opening position saved');
}
function assetUpdatePosition(assetId){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const curQty=assetHeldQty(a),curCost=assetCostBasis(a);
  const curAvg=curQty?curCost/curQty:0;
  modal('Update position',`
    <p class="muted" style="margin-bottom:12px;line-height:1.5">Made a few purchases this month and don't want to log each one? Enter your <b>new total units held</b> and <b>new average cost per unit</b> — the difference from your current position is absorbed into the opening/base entry automatically.</p>
    <div class="hint" style="margin-bottom:10px">Current: <b>${(+curQty).toLocaleString()}</b> units @ avg <b>${fmt$(curAvg)}</b> (cost basis ${fmt$(curCost)})</div>
    <div class="fldrow">
      <div><label class="fld">Total units held now</label><input id="f_q" class="input money" value="${curQty}"></div>
      <div><label class="fld">New average cost per unit ($)</label><input id="f_p2" class="input money" value="${curAvg?curAvg.toFixed(2):''}"></div>
    </div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="assetUpdatePositionSave('${assetId}')">Save</button>`);
}
function assetUpdatePositionSave(assetId){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  if(!a.transactions)a.transactions=[];
  const newQty=num($('#f_q').value),newAvg=num($('#f_p2').value);
  const newCost=newQty*newAvg;
  const others=a.transactions.filter(t=>t.type!=='base');
  const othQty=others.reduce((s,t)=>t.type==='sell'?s-num(t.qty):s+num(t.qty),0);
  const othCost=txCostBasis(others);
  let baseQty=newQty-othQty,basePrice=0;
  if(baseQty>0)basePrice=(newCost-othCost)/baseQty;
  else baseQty=0; // can't go negative — your logged buys/sells already exceed the new total
  let t=a.transactions.find(x=>x.type==='base');
  if(t){t.qty=baseQty;t.price=basePrice;}
  else a.transactions.push({id:uid(),type:'base',date:'2000-01-01',qty:baseQty,price:basePrice,fees:0});
  save();closeModal();render();toast('Position updated');
}
function assetTxAdd(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const t=i!=null?a.transactions[i]:{type:'buy',date:todayISO(),qty:'',price:'',fees:''};
  modal(i!=null?'Edit transaction':'Add transaction',`
    <div class="fldrow"><div><label class="fld">Type</label><select id="f_t" class="input">
      <option value="buy"  ${t.type==='buy'?'selected':''}>Buy</option>
      <option value="sell" ${t.type==='sell'?'selected':''}>Sell</option>
      <option value="drp"  ${t.type==='drp'?'selected':''}>DRP (dividend reinvestment)</option></select></div>
    <div><label class="fld">Date</label><input id="f_d" type="date" class="input" value="${t.date}"></div></div>
    <div class="fldrow mt">
      <div><label class="fld">Qty / units</label><input id="f_q" class="input money" value="${t.qty}" oninput="txCalc()"></div>
      <div><label class="fld">Price per unit ($)</label><input id="f_p2" class="input money" value="${t.price}" oninput="txCalc()"></div>
      <div><label class="fld">Brokerage / fees ($)</label><input id="f_f" class="input money" value="${t.fees||''}" oninput="txCalc()"></div>
    </div>
    <div class="note" id="txCalcHint"></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="assetTxSave('${assetId}',${i==null?'null':i})">Save</button>`);
  setTimeout(txCalc,30);
}
function txCalc(){
  const el=$('#txCalcHint');if(!el)return;
  const q=num($('#f_q').value),p=num($('#f_p2').value),f=num($('#f_f').value)||0;
  const type=$('#f_t').value;
  if(!q||!p){el.innerHTML='';return;}
  const total=q*p+(type!=='sell'?f:0);
  el.innerHTML=`${type==='sell'?'Proceeds':'Total cost'}: <b>${fmt$(total)}</b>${f>0&&type!=='sell'?' incl. '+fmt$(f)+' brokerage':''}`;
}
let ASSET_TX_PENDING=null;
function assetTxSave(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  if(!a.transactions)a.transactions=[];
  const t={id:i!=null?a.transactions[i].id:uid(),type:$('#f_t').value,date:$('#f_d').value,
    qty:num($('#f_q').value),price:num($('#f_p2').value),fees:num($('#f_f').value)||0};
  const isSell=t.type==='sell';

  // Calculate current held units (before this transaction is applied).
  // 'base' (opening position) and 'drp' count as acquisitions alongside
  // 'buy' — only 'sell' and 'checkpoint' (a sync marker, not a real
  // transaction) are excluded from this running total.
  const currentQty=a.transactions.filter((tx,ti)=>ti!==i).reduce((s,tx)=>{
    if(tx.type==='sell')return s-num(tx.qty);
    if(tx.type==='checkpoint')return s;
    return s+num(tx.qty); // buy, drp, base
  },0);

  // Warn and offer auto-close when selling all remaining units. The
  // transaction data (t, i, assetId) is captured into ASSET_TX_PENDING here
  // — once the confirmation modal below replaces the form's DOM, the
  // original #f_t/#f_d/#f_q/#f_p2/#f_f inputs no longer exist, so the
  // confirm buttons must NOT try to re-read them (that was the bug: calling
  // this function a second time on click threw on $('#f_t').value being
  // null, silently killing the save with no visible error).
  if(isSell&&Math.abs(currentQty-t.qty)<0.0001){
    const{avgCost}=assetTxCostBasis(a,i);
    const proceeds=t.qty*t.price-t.fees;
    const costBase=currentQty*avgCost;
    const profit=proceeds-costBase;
    const brokerageNote=t.fees?`<br><span class="muted" style="font-size:.82rem">Brokerage of ${fmt$(t.fees)} is deductible as a cost of disposal — it reduces the capital gain and should be included in your CGT calculation.</span>`:'';
    ASSET_TX_PENDING={assetId,i,t};
    modal('Close position?',`
      <div class="hint" style="margin-bottom:10px">You're selling <b>all ${t.qty.toLocaleString()} units</b> of ${esc(a.name)} — this closes the entire position.</div>
      <div class="kv"><span class="k">Avg cost base per unit</span><span class="v">${fmt$(avgCost)}</span></div>
      <div class="kv"><span class="k">Net proceeds (after brokerage)</span><span class="v">${fmt$(proceeds)}</span></div>
      <div class="kv"><span class="k">Total cost base</span><span class="v">${fmt$(costBase)}</span></div>
      <div class="kv big"><span class="k">${profit>=0?'Capital gain':'Capital loss'}</span><span class="v" style="color:${profit>=0?'var(--euc)':'var(--red)'}">${fmt$(Math.abs(profit))}</span></div>
      ${profit>0&&t.date?`<div class="note" style="margin-top:8px">If held >12 months (purchased before ${fmtDate(new Date(new Date(t.date+'T00:00:00Z')-365*86400000).toISOString().slice(0,10))}), you may be eligible for the 50% CGT discount.</div>`:''}
      ${brokerageNote}
      <div class="mt">This will be recorded as a capital gain/loss in <b>Share sales</b> automatically. Also mark the asset as <b>closed</b> so it no longer appears in active holdings?</div>`,
      `<button class="btn" onclick="assetTxConfirmClose(false)">Save without closing</button>
       <button class="btn primary" onclick="assetTxConfirmClose(true)">Save &amp; close position</button>`);
    return;
  }
  assetTxCommit(assetId,i,t,false);
}
/* Called from the Close position? modal's buttons — uses the transaction
   data captured in ASSET_TX_PENDING rather than re-reading form fields that
   no longer exist once this confirmation dialog has replaced them. */
function assetTxConfirmClose(close){
  if(!ASSET_TX_PENDING)return;
  const{assetId,i,t}=ASSET_TX_PENDING;
  ASSET_TX_PENDING=null;
  assetTxCommit(assetId,i,t,close);
}
/* Blended average cost base across remaining buy/DRP/opening-position lots
   for asset `a`, excluding the transaction at index `i` (the one currently
   being edited, if any) — and the earliest of those lots' dates, used as a
   FIFO-style acquisition date for the CGT 12-month discount test. This is a
   simplification, the same one the manual Share Sales page already uses
   with a single buy/sell date pair. 'base' (opening position) is included
   here too — omitting it would make avgCost calculate as $0 for any holding
   set up via "opening position" rather than individually logged buys,
   hugely overstating the capital gain on sale.
   Must give an identical result whether called before or after the
   Close-position confirmation step, since no transactions change in
   between — so it's safe to recompute fresh at commit time. */
function assetTxCostBasis(a,i){
  const currentQty=a.transactions.filter((tx,ti)=>ti!==i).reduce((s,tx)=>{
    if(tx.type==='sell')return s-num(tx.qty);
    if(tx.type==='checkpoint')return s;
    return s+num(tx.qty);
  },0);
  const buys=a.transactions.filter((tx,ti)=>ti!==i&&(tx.type==='buy'||tx.type==='drp'||tx.type==='base'));
  const totalQty=buys.reduce((s,tx)=>s+num(tx.qty),0)||currentQty;
  const totalCost=buys.reduce((s,tx)=>s+num(tx.qty)*num(tx.price)+num(tx.fees),0);
  const avgCost=totalQty>0?totalCost/totalQty:0;
  const earliestBuy=buys.reduce((min,tx)=>(!min||tx.date<min)?tx.date:min,null);
  return{avgCost,earliestBuy};
}
/* Actually applies a transaction save: writes the transaction, auto-creates
   or updates the linked CGT sale record for sells, and optionally closes
   the position. Shared by both the direct-save path (no close-detection
   needed) and the Close-position confirmation path. */
function assetTxCommit(assetId,i,t,close){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const isSell=t.type==='sell';
  if(i!=null)a.transactions[i]=t;else a.transactions.push(t);

  // Every sell — partial or full — realises a capital gain/loss. Auto-create
  // or update a linked Share Sales record so this actually feeds the CGT/tax
  // calculation, not just the informational modal above. Linked via txId so
  // editing or deleting the transaction keeps the sale record in sync.
  if(isSell&&t.qty>0){
    const{avgCost,earliestBuy}=assetTxCostBasis(a,i);
    const costBase=Math.round(avgCost*t.qty*100)/100;
    const proceeds=Math.round((t.qty*t.price-t.fees)*100)/100;
    const saleFY=yearContainingDate(t.date);
    if(saleFY){
      const pid=a.pid||DB.currentPid;
      const B=bucket(saleFY,pid);
      B.sales=B.sales||[];
      const existingIdx=B.sales.findIndex(s=>s.txId===t.id);
      const rec={id:existingIdx>=0?B.sales[existingIdx].id:uid(),txId:t.id,assetId:a.id,
        code:a.code||a.name,buyDate:earliestBuy||t.date,sellDate:t.date,costBase,proceeds,auto:true};
      if(existingIdx>=0)B.sales[existingIdx]=rec;else B.sales.push(rec);
    }
  }

  if(close){
    a.closedDate=t.date;
    toast(`Position closed — ${esc(a.name)} moved to closed holdings`);
  }
  save();closeModal();render();
  if(!close)toast(isSell?'Transaction saved — capital gain/loss recorded in Share sales':'Transaction saved');
}
/* Deletes a transaction and, if it was a sell, the linked auto-generated
   Share Sales record too (searches every FY bucket for every person, since
   the sale could have been filed under a different FY to the one currently
   selected if the transaction date falls outside it). */
function assetTxDelete(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  const t=a.transactions[i];if(!t)return;
  confirmDel('Delete this transaction?',()=>{
    if(t.type==='sell'){
      Object.values(DB.years).forEach(y=>{
        Object.values(y.people||{}).forEach(b=>{
          b.sales=(b.sales||[]).filter(s=>s.txId!==t.id);
        });
      });
    }
    a.transactions.splice(i,1);
    save();render();
  });
}

/* ---- Frequent Flyer points asset card ---- */
function assetFFCard(a){
  const pid=a.pid||DB.people[0].id;
  const log=(a.pointsLog||[]).slice().sort((x,y)=>x.date<y.date?-1:1);
  const latest=log.length?log[log.length-1]:null;
  const pts=latest?num(latest.points):0;
  const centsEach=num(a.ffPointValue)||1;
  const approxValue=pts*centsEach/100;
  const prev12=log.filter(e=>e.date<=iso(new Date(Date.now()-365*86400*1000))).slice(-1)[0];
  const change12=prev12?pts-num(prev12.points):null;
  const seriesPts=log.map(e=>({label:e.date.slice(0,7),value:num(e.points)}));
  const emoji='✈️';
  return `<div class="card"><div class="chead"><h2>${isAll()?pdot(person(pid))+' ':''}${emoji} ${esc(a.name)}</h2><span class="actions">
    <button class="btn small" onclick="assetAdd('${a.id}')">Edit</button>
    <button class="btn small primary" onclick="ffLogAdd('${a.id}')">+ Balance entry</button>
    <button class="btn ghost small" onclick="confirmDel('Delete ${esc(a.name)} and its balance history?',()=>assetDelete('${a.id}'))">✕</button></span></div>
  <div class="cbody">
    <div class="grid3">
      <div class="stat good"><div class="l">Current balance</div><div class="v">${pts>0?pts.toLocaleString()+' pts':'—'}</div><div class="d">${latest?'as of '+fmtDate(latest.date):''}</div></div>
      <div class="stat"><div class="l">Approx. value</div><div class="v">${pts>0?fmt$0(approxValue):'—'}</div><div class="d">at ${centsEach}¢ / point</div></div>
      ${change12!=null?`<div class="stat ${change12>=0?'good':'bad'}"><div class="l">Change (12 months)</div><div class="v">${change12>=0?'+':''}${change12.toLocaleString()} pts</div><div class="d">${change12>=0?'earned':'spent'} net</div></div>`:`<div class="stat"><div class="l">Program</div><div class="v" style="font-size:1rem">${esc(a.ffProgram||'—')}</div></div>`}
    </div>
    ${seriesPts.length>1?`<div class="mt">${lineChartSVG(seriesPts,{aria:'Points balance over time'})}</div>`:'<div class="hint mt">Add a second balance entry to see your points trend over time.</div>'}
    <h3 class="mt" style="font-size:.92rem">Balance history</h3>
    ${log.length?`<table class="tbl mt" style="font-size:.84rem"><thead><tr><th>Date</th><th class="num">Points</th><th>Note</th><th></th></tr></thead><tbody>${
      log.map((e,li)=>{const realI=a.pointsLog.indexOf(e);
        return `<tr><td>${fmtDate(e.date)}</td><td class="num">${num(e.points).toLocaleString()}</td><td class="muted">${esc(e.note||'')}</td>
          <td class="rowact"><button class="btn ghost small" onclick="ffLogAdd('${a.id}',${realI})">Edit</button>
          <button class="btn ghost small" onclick="ffLogDelete('${a.id}',${realI})">✕</button></td></tr>`;}).join('')
    }</tbody></table>`:'<div class="hint mt">No balance entries yet — add your first one above.</div>'}
    <div class="note mt">Point values are approximate and vary by how points are redeemed. The value per point can be updated in Settings → Frequent Flyer, or by editing this asset.</div>
  </div></div>`;
}
function ffLogAdd(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;a.pointsLog=a.pointsLog||[];
  const r=i!=null?a.pointsLog[i]:{date:todayISO(),points:'',note:''};
  modal(i!=null?'Edit balance entry':'Add balance entry',`
    <div class="fldrow"><div><label class="fld">Date</label><input id="f_d" type="date" class="input" value="${r.date}"></div>
    <div><label class="fld">Points balance</label><input id="f_pts" class="input money" value="${r.points}" placeholder="e.g. 45000"></div></div>
    <div class="fldrow mt"><div style="flex:2"><label class="fld">Note <span class="muted">(optional)</span></label><input id="f_note" class="input" value="${esc(r.note||'')}" placeholder="e.g. Redeemed for SYD-MEL flight"></div></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="ffLogSave('${assetId}',${i==null?'null':i})">Save</button>`);
}
function ffLogSave(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;a.pointsLog=a.pointsLog||[];
  const r={id:i!=null?a.pointsLog[i].id:uid(),date:$('#f_d').value||todayISO(),points:num($('#f_pts').value),note:$('#f_note').value.trim()};
  if(i!=null)a.pointsLog[i]=r;else a.pointsLog.push(r);
  save();closeModal();render();toast('Balance entry saved');
}
function ffLogDelete(assetId,i){const a=DB.assets.find(x=>x.id===assetId);if(!a)return;a.pointsLog.splice(i,1);save();render();}
/* Investment property yearly income/tax statement attachment — stored per FY */
function propAssetStmtOpen(assetId){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  const fyKey=String(fyOrderYear(FY()));
  a.annualStatements=a.annualStatements||{};
  const current=a.annualStatements[fyKey];
  modal(`Attach statement — ${esc(a.name)} (${esc(fyDisplay(FY()))})`,`
    <div class="hint">Attach this property's annual income & expenses statement for <b>${esc(fyDisplay(FY()))}</b> (e.g. from your property manager, showing rent received, management fees, and outgoings for the year).</div>
    <div class="mt"><label class="fld">File ${current?'(replaces existing)':''}</label>
      <input id="f_prop_stmt" type="file" class="input" accept="image/*,.pdf"></div>
    ${current?`<div class="mt"><span class="rcpt-file" onclick="rcptView('${current.id}','${esc(current.name||'statement')}')">📎 Current (${esc(fyDisplay(FY()))}): ${esc(current.name||'statement')}</span></div>`:''}`,
    `<button class="btn" data-close>Cancel</button>
     ${current?`<button class="btn ghost" onclick="propAssetStmtDetach('${assetId}')">Remove</button>`:''}
     <button class="btn primary" onclick="propAssetStmtSave('${assetId}')">Attach</button>`);
}
async function propAssetStmtSave(assetId){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  const file=$('#f_prop_stmt')?.files[0];
  if(!file)return toast('Choose a file first');
  const fyKey=String(fyOrderYear(FY()));
  a.annualStatements=a.annualStatements||{};
  const oldRid=a.annualStatements[fyKey]?.id;
  const newId=uid();
  a.annualStatements[fyKey]={id:newId,name:file.name};
  closeModal();save();render();toast('Attaching…');
  try{
    await rcptPut({id:newId,name:file.name,type:file.type,blob:file},{fy:fyDisplay(FY()),category:'Investment Property',date:todayISO(),itemName:`${a.name} — annual statement`,pid:a.pid||DB.currentPid});
    if(oldRid&&!receiptStillReferenced(oldRid))rcptDel(oldRid).catch(()=>{});
    toast('Statement attached');render();
  }catch(e){toast("Couldn't attach statement — try again");}
}
function propAssetStmtDetach(assetId){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  const fyKey=String(fyOrderYear(FY()));
  a.annualStatements=a.annualStatements||{};
  const rid=a.annualStatements[fyKey]?.id;
  delete a.annualStatements[fyKey];
  closeModal();save();render();
  if(rid&&!receiptStillReferenced(rid))rcptDel(rid).catch(()=>{});
  toast('Statement removed');
}
function assetCard(a){
  if(a.kind==='shares'||a.kind==='managed_fund')return assetShareCard(a);
  if(a.kind==='ff_points')return assetFFCard(a);
  const directLinked=DB.nw.items.filter(it=>it.assetId===a.id);
  const loanItemForLinks=directLinked.find(it=>it.kind==='liability');
  const offsetForLinks=loanItemForLinks&&loanItemForLinks.offsetItemId?DB.nw.items.find(x=>x.id===loanItemForLinks.offsetItemId):null;
  const linked=offsetForLinks&&!directLinked.some(it=>it.id===offsetForLinks.id)?[...directLinked,offsetForLinks]:directLinked;
  // Scope "current" values to the selected FY's end date (frozen for past
  // FYs, same as the Net Worth page's "latest value" handling) rather than
  // always showing the absolute latest entry regardless of which FY is
  // being viewed.
  const eqFYEnd=isAllFY()?todayISO():fyRange(FY()).end;
  const eqToday=todayISO();
  const eqCutoff=eqFYEnd<eqToday?eqFYEnd:eqToday;
  const linkedRows=linked.map(it=>{
    const es=nwEntriesOf(it.id);
    const val=nwValueAt(it.id,eqCutoff);
    const cur=val!=null?{value:val,date:(es.filter(e=>e.date<=eqCutoff).slice(-1)[0]||{}).date}:null;
    const isOffsetViaLoan=offsetForLinks&&it.id===offsetForLinks.id;
    return `<div class="kv"><span class="k">${pdot(person(it.pid))} ${esc(it.name)} <span class="badge ${it.kind==='liability'?'red':'euc'}">${isOffsetViaLoan?'offset · linked via loan':it.kind}</span></span>
      <span class="v">${cur?fmt$(cur.value)+' <span class="muted" style="font-weight:400">at '+fmtDate(cur.date)+'</span>':'<span class="muted">no entries yet</span>'}</span></div>`;
  }).join('');
  const equity=linked.reduce((s,it)=>{const v=nwValueAt(it.id,eqCutoff);return s+(v!=null?v:0);},0);
  // per-FY picture: property expenses across all people + cost spread
  const fyRows=Object.values(DB.years).sort((x,y)=>fyOrderYear(y)-fyOrderYear(x)).map(y=>{
    let exp=0;DB.people.forEach(pp=>{exp+=bucket(y,pp.id).property.expenses.reduce((s,e)=>s+num(e.amount),0);});
    const spread=costScheduleForFY(a,y);
    const mgmt=managementFeeForFY(a,y);
    const dep=depreciationForFY(a,y);
    const rent=rentalIncomeEffective(a,y);
    return `<tr><td>${esc(fyDisplay(y))} ${y.locked?'🔒':''}</td><td class="num">${fmt$(exp)}</td><td class="num">${fmt$(spread)}</td><td class="num">${mgmt>0?fmt$(mgmt):'<span class="muted">—</span>'}</td><td class="num">${dep>0?fmt$(dep):'<span class="muted">—</span>'}</td><td class="num" style="color:var(--euc)">${rent>0?fmt$(rent):'<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  const costRows=(a.costs||[]).map((c,i)=>{
    const sched=assetCostSchedule(a,c);
    const schedStr=sched.map(r=>{
      const fy=yearByOrderYear(r.fy);
      const label=fy?fyDisplay(fy):'FY'+String(r.fy).slice(2)+'–'+String(r.fy+1).slice(2);
      return `${label}: <b>${fmt$(r.amount)}</b>`;
    }).join(' · ');
    return `<tr><td>${esc(c.name)}</td><td>${fmtDate(c.date)}</td><td class="num">${fmt$(c.amount)}</td>
      <td>${num(c.spreadYears)>1?`<span class="badge gold">${c.spreadYears} years</span>`:'<span class="badge euc">single year</span>'}</td>
      <td style="font-size:.8rem">${schedStr}</td>
      <td class="rowact"><button class="btn ghost small" onclick="assetCostAdd('${a.id}',${i})">Edit</button>
      <button class="btn ghost small" onclick="confirmDel('Delete this cost?',()=>{DB.assets.find(x=>x.id==='${a.id}').costs.splice(${i},1);save();render()})">✕</button></td></tr>`;
  }).join('');
  const emoji=a.kind==='vehicle'?'🚗':a.kind==='property'?'🏠':'📦';
  const vehStats=a.kind==='vehicle'?(()=>{
    const est=vehicleEstimatedValue(a);
    const kmYr=vehicleKmPerYear(a);
    return `<div class="stat"><div class="l">Estimated value today</div><div class="v">${est!=null?fmt$0(est):'—'}</div><div class="d">${a.depreciationRate||15}%/yr diminishing value</div></div>
    <div class="stat"><div class="l">Estimated km / year</div><div class="v">${kmYr!=null?Math.round(kmYr).toLocaleString()+' km':'—'}</div><div class="d">${(a.odometer||[]).length<2?'add 2+ odometer readings':'from odometer history'}</div></div>`;
  })():'';
  const odoSection=a.kind==='vehicle'?`<h3 class="mt" style="font-size:.92rem">Odometer</h3>
    ${(a.odometer||[]).length>1?lineChartSVG((a.odometer||[]).slice().sort((x,y)=>x.date<y.date?-1:1).map(r=>({label:fmtDate(r.date),value:num(r.km)})),{aria:'Odometer readings over time'}):''}
    ${(a.odometer||[]).length?`<table class="tbl mt" style="font-size:.84rem"><thead><tr><th>Date</th><th class="num">Odometer (km)</th><th></th></tr></thead><tbody>${
      (a.odometer||[]).slice().sort((x,y)=>x.date<y.date?-1:1).map(r=>{
        const realI=a.odometer.indexOf(r);
        return `<tr><td>${fmtDate(r.date)}</td><td class="num">${num(r.km).toLocaleString()}</td>
          <td class="rowact"><button class="btn ghost small" onclick="vehicleOdoAdd('${a.id}',${realI})">Edit</button>
          <button class="btn ghost small" onclick="vehicleOdoDelete('${a.id}',${realI})">✕</button></td></tr>`;
      }).join('')
    }</tbody></table>`:'<div class="hint mt">Log odometer readings over time to estimate your annual driving distance.</div>'}
    <button class="btn small mt" onclick="vehicleOdoAdd('${a.id}')">+ Add odometer reading</button>`:'';
  return `<div class="card${a.closedDate?' archived':''}"><div class="chead"><h2>${isAll()?'':`<input type="checkbox" ${ASSET_SELECTED.has(a.id)?'checked':''} onchange="assetToggleSelect('${a.id}',this.checked)" title="Select for bulk delete" style="margin-right:6px;vertical-align:middle">`}${isAll()?pdot(person(a.pid||DB.people[0].id))+' ':''}${emoji} ${esc(a.name)}${a.kind==='property'&&a.investment===false?' <span class="badge">Home</span>':''}${a.closedDate?` <span class="badge gold">closed ${fmtDate(a.closedDate)}</span>`:''}</h2><span class="actions">
      ${a.url?`<a class="btn small" href="${esc(a.url)}" target="_blank" rel="noopener">Open listing ↗</a>`:''}
      ${a.kind==='property'&&a.investment!==false?`<button class="btn small" onclick="propAssetStmtOpen('${a.id}')">📎 ${(a.annualStatements||{})[String(fyOrderYear(FY()))]?'Replace statement':'Attach statement'} (${esc(fyDisplay(FY()))})</button>`:''}
      ${a.kind==='property'&&a.investment!==false?`<button class="btn small" onclick="assetCostAdd('${a.id}')">+ Purchase / borrowing cost</button>`:''}
      ${isAll()?'':a.closedDate?`<button class="btn small ghost" onclick="assetReopenPosition('${a.id}')">Reopen</button>`:`<button class="btn small ghost" onclick="assetClosePosition('${a.id}')">Close position</button>`}
      <button class="btn small ghost" onclick="assetDetailOpen('${a.id}')">📊 Details</button>
      <button class="btn small" onclick="assetAdd('${a.id}')">Edit</button>
      <button class="btn ghost small" onclick="confirmDel('Delete ${esc(a.name)} and its linked net worth items (valuation, loan, and their value history)? This does not delete Investment Property expenses already recorded in past financial years.',()=>assetDelete('${a.id}'))">✕</button></span></div>
    <div class="cbody">
      <div class="grid3">
        <div class="stat"><div class="l">Purchased</div><div class="v" style="font-size:1.1rem">${a.purchaseDate?fmtDate(a.purchaseDate):'—'}</div><div class="d">${a.purchasePrice?'for '+fmt$0(a.purchasePrice):''}</div></div>
        <div class="stat ${equity>=0?'good':'bad'}"><div class="l">Current equity (linked items)</div><div class="v">${linked.length?fmt$0(equity):'—'}</div><div class="d">${eqCutoff<eqToday?'as of '+fmtDate(eqCutoff)+' · ':''}${a.address?esc(a.address):''}</div></div>
        <div class="stat"><div class="l">Tracked in net worth</div><div class="v" style="font-size:1.1rem">${linked.length} item(s)</div><div class="d"><a href="#" onclick="go('networth');return false">update values there →</a></div></div>
        ${vehStats}
      </div>
      ${linkedRows?`<div class="mt">${linkedRows}</div>`:`<div class="note">No linked net worth items — edit the asset and tick “create valuation${a.kind==='property'?' & loan':''} items” to start month-to-month tracking.</div>`}
      ${a.kind==='property'&&a.investment===false?'':assetRentalSection(a)}
      ${a.kind==='property'&&a.investment!==false?assetManagementFeeSection(a):''}
      ${a.kind==='property'&&a.investment!==false?assetCashflowSection(a):''}
      ${assetOffsetSection(a)}
      ${a.kind==='property'&&a.investment!==false?assetDepreciationSection(a):''}
      ${odoSection}
      ${a.kind==='property'&&a.investment===false?'':`<h3 class="mt" style="font-size:.92rem">Purchase & borrowing costs — spread across financial years</h3>
      ${costRows?`<table class="tbl mt"><thead><tr><th>Cost</th><th>Date</th><th class="num">Amount</th><th>Spread</th><th>Claim schedule</th><th></th></tr></thead><tbody>${costRows}</tbody></table>`
        :'<div class="hint mt">e.g. loan establishment fees, LMI, title search — anything claimed over 5 years. Stamp duty generally isn\u2019t deductible for residential property (it forms part of the cost base); check with your accountant.</div>'}`}
      ${a.kind==='property'&&a.investment===false?`<h3 class="mt" style="font-size:.92rem">Expenses</h3>
      ${assetPropertyExpenses(a)}
      <div class="note mt">This is set as a home (not rented out), so none of these expenses are tax-deductible — rental income, management fees, gearing, depreciation, and borrowing-cost deductions are switched off too. Tracking is for your own budgeting (insurance, rates, loan repayments, etc.).</div>`:`
      <h3 class="mt" style="font-size:.92rem">Expenses${isAllFY()?' by financial year':' — '+esc(fyDisplay(FY()))}</h3>
      ${a.kind==='property'||a.kind==='vehicle'?assetPropertyExpenses(a):`<div class="note">Expenses for this asset are tracked per FY in the Expenses page.</div>`}
      ${a.kind==='property'?(isAllFY()
        ?`<table class="tbl mt" style="font-size:.84rem"><thead><tr><th>Year</th><th class="num">Property expenses</th><th class="num">Cost spread</th><th class="num">Mgmt fee</th><th class="num">Depreciation</th><th class="num">Rental income</th></tr></thead><tbody>${fyRows}</tbody></table>`
        :(()=>{
          let exp=0;DB.people.forEach(pp=>{exp+=bucket(FY(),pp.id).property.expenses.reduce((s,e)=>s+num(e.amount),0);});
          const spread=costScheduleForFY(a,FY()),mgmt=managementFeeForFY(a,FY()),dep=depreciationForFY(a,FY()),rent=rentalIncomeEffective(a,FY());
          return `<div class="grid3" style="gap:8px;margin-top:8px"><div class="stat"><div class="l">Property expenses</div><div class="v" style="font-size:1.05rem">${fmt$0(exp)}</div></div><div class="stat"><div class="l">Cost spread</div><div class="v" style="font-size:1.05rem">${fmt$0(spread)}</div></div><div class="stat"><div class="l">Mgmt fee</div><div class="v" style="font-size:1.05rem">${mgmt>0?fmt$0(mgmt):'—'}</div></div><div class="stat"><div class="l">Depreciation</div><div class="v" style="font-size:1.05rem">${dep>0?fmt$0(dep):'—'}</div></div><div class="stat"><div class="l">Rental income</div><div class="v" style="font-size:1.05rem;color:var(--euc)">${rent>0?fmt$0(rent):'—'}</div></div></div>`;
        })()):''}`}
      ${(a.kind==='shares'||a.kind==='managed_fund')?platformTransferSection(a):''}
    </div></div>`;
}
/* Platform transfer log — records when shares were moved between brokers */
function platformTransferSection(a){
  const hist=(a.platformHistory||[]).slice().sort((x,y)=>x.date<y.date?-1:1);
  if(!hist.length)return`<div class="mt"><div style="display:flex;align-items:center;justify-content:space-between"><h3 style="font-size:.92rem">Platform history</h3><button class="btn ghost small" onclick="platformTransferAdd('${a.id}')">+ Log transfer</button></div>
    <div class="hint">Record when you transfer this holding to a different broker — useful for tracking CGT cost bases across platforms.</div></div>`;
  const rows=hist.map((h,i)=>`<tr>
    <td>${fmtDate(h.date)}</td>
    <td>${h.from?`<span class="muted">${esc(h.from)}</span> → `:''}<b>${esc(h.to||'?')}</b></td>
    <td>${esc(h.note||'')}</td>
    <td class="rowact"><button class="btn ghost small" onclick="platformTransferAdd('${a.id}',${i})">Edit</button>
      <button class="btn ghost small" onclick="confirmDel('Delete this transfer record?',()=>{DB.assets.find(x=>x.id==='${a.id}').platformHistory.splice(${i},1);save();render()})">✕</button></td>
  </tr>`).join('');
  return `<div class="mt"><h3 style="font-size:.92rem;display:flex;align-items:center;justify-content:space-between">
    Platform history <button class="btn ghost small" onclick="platformTransferAdd('${a.id}')">+ Log transfer</button></h3>
    <table class="tbl mt"><thead><tr><th>Date</th><th>Platform change</th><th>Note</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>`;
}
function platformTransferAdd(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  a.platformHistory=a.platformHistory||[];
  const h=i!=null?a.platformHistory[i]:{date:todayISO(),from:a.platform||'',to:'',note:''};
  const platOpts=(DB.platforms||[]).map(p=>`<option value="${esc(p)}" ${h.to===p?'selected':''}>${esc(p)}</option>`).join('');
  const fromOpts=(DB.platforms||[]).map(p=>`<option value="${esc(p)}" ${h.from===p?'selected':''}>${esc(p)}</option>`).join('');
  modal(i!=null?'Edit platform transfer':'Log platform transfer',`
    <div class="hint">Record when this holding was transferred to a different broker. The asset's current platform is updated to the most recent destination.</div>
    <div class="fldrow mt">
      <div><label class="fld">Transfer date</label><input id="f_td" type="date" class="input" value="${h.date||todayISO()}"></div>
      <div><label class="fld">From platform</label><select id="f_tfrom" class="input"><option value="">— unknown —</option>${fromOpts}</select></div>
      <div><label class="fld">To platform</label><select id="f_tto" class="input"><option value="">— select destination —</option>${platOpts}</select></div>
    </div>
    <div class="mt"><label class="fld">Note <span class="muted">(optional)</span></label><input id="f_tnote" class="input" value="${esc(h.note||'')}" placeholder="e.g. Broker-to-broker transfer, CHESS sponsorship change"></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="platformTransferSave('${assetId}',${i==null?'null':i})">Save</button>`);
}
function platformTransferSave(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  a.platformHistory=a.platformHistory||[];
  const h={date:$('#f_td').value||todayISO(),from:$('#f_tfrom').value,to:$('#f_tto').value,note:$('#f_tnote').value.trim()};
  if(!h.to)return toast('Select the destination platform');
  if(i!=null)a.platformHistory[i]=h;else a.platformHistory.push(h);
  // Keep asset's current platform in sync with most recent transfer
  const sorted=(a.platformHistory||[]).slice().sort((x,y)=>x.date<y.date?-1:1);
  if(sorted.length)a.platform=sorted[sorted.length-1].to;
  save();closeModal();render();toast('Platform transfer recorded');
}
function assetRentalSection(a){
  if(a.kind!=='property')return'';
  const hist=(a.rental?.history||[]).slice().sort((x,y)=>x.startDate<y.startDate?-1:1);
  const cur=rentalCurrentRate(a);
  const y=FY();
  const fyIncome=rentalIncomeEffective(a,y);
  const calc=rentalIncomeForFY(a,y);
  const isOverridden=a.rentalOverrides&&a.rentalOverrides[String(y.startYear)]!=null;
  const rows=hist.map((p,i)=>{
    const isActive=p.startDate<=todayISO()&&(!hist[i+1]||hist[i+1].startDate>todayISO());
    return `<tr><td>${fmtDate(p.startDate)}${isActive?` <span class="badge euc" style="font-size:.65rem">current</span>`:''}</td>
      <td class="num">${fmt$(p.amount)}</td>
      <td>${({weekly:'Weekly',fortnightly:'Fortnightly',monthly:'Monthly',quarterly:'Quarterly',yearly:'Yearly'})[p.frequency]||p.frequency}</td>
      <td class="num">${fmt$0(rentalYearly(p.amount,p.frequency))}/yr</td>
      <td>${esc(p.note||'')}</td>
      <td class="rowact"><button class="btn ghost small" onclick="assetRentalAdd('${a.id}',${i})">Edit</button>
        <button class="btn ghost small" onclick="confirmDel('Delete this rental period?',()=>{DB.assets.find(x=>x.id==='${a.id}').rental.history.splice(${i},1);save();render()})">✕</button></td></tr>`;
  }).join('');
  return `<div class="mt">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px">
      <h3 style="font-size:.92rem">Rental income</h3>
      <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${cur?`<span class="muted" style="font-size:.84rem">${fmt$(cur.amount)}/${esc(cur.frequency)} · ${fmt$0(rentalYearly(cur.amount,cur.frequency))}/yr</span>`:''}
        ${fyIncome||isOverridden?`<span class="badge ${isOverridden?'gold':'euc'}">${fmt$0(fyIncome)} in ${esc(fyDisplay(y))}${isOverridden?' (override)':''}</span>`:''}
        ${isAll()?'':`<a href="#" style="font-size:.78rem" onclick="rentalOverrideEdit('${a.id}');return false">${isOverridden?'edit override':'override this FY'}</a>`}
        ${isAll()?'':`<button class="btn small primary" onclick="assetRentalAdd('${a.id}')">+ ${hist.length?'Add rate change':'Set rental rate'}</button>`}
      </span>
    </div>
    ${rows?`<table class="tbl mt"><thead><tr><th>Effective from</th><th class="num">Amount</th><th>Frequency</th><th class="num">Yearly</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      :`<div class="hint">Not yet set — click <b>+ Set rental rate</b> to record the current rent and generate income automatically.</div>`}
    ${fyIncome||isOverridden?`<div class="note" style="margin-top:8px">${isOverridden?`<b>Overridden</b> to ${fmt$0(fyIncome)} for ${esc(fyDisplay(y))} (calculated: ${fmt$0(calc)}).`:`This rental income (<b>${fmt$0(fyIncome)}</b> estimated for ${esc(fyDisplay(y))}) is included automatically in your Income page and FY summary — no need to enter it separately there.`}</div>`:''}
  </div>`;
}
function assetRentalAdd(assetId, i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  a.rental=a.rental||{history:[]};
  const isFirst=i==null&&!a.rental.history.length;
  const r=i!=null?a.rental.history[i]:{amount:'',frequency:'weekly',startDate:(isFirst&&a.purchaseDate)||todayISO(),note:''};
  modal(i!=null?'Edit rental period':'Add rental period',`
    <div class="fldrow">
      <div><label class="fld">Amount ($)</label><input id="f_ra" class="input money" value="${r.amount}" oninput="rentalCalcPreview()"></div>
      <div><label class="fld">Frequency</label><select id="f_rf" class="input" onchange="rentalCalcPreview()">
        <option value="weekly" ${r.frequency==='weekly'?'selected':''}>Weekly</option>
        <option value="fortnightly" ${r.frequency==='fortnightly'?'selected':''}>Fortnightly</option>
        <option value="monthly" ${r.frequency==='monthly'?'selected':''}>Monthly</option></select></div>
    </div>
    <div class="fldrow mt">
      <div><label class="fld">Effective from <span class="muted">(when this rate took effect)</span></label>
        <input id="f_rs" type="date" class="input" value="${r.startDate}" oninput="rentalCalcPreview()"></div>
    </div>
    <div class="note" id="rentalPreview" style="margin-top:8px"></div>
    <div class="fldrow mt">
      <div><label class="fld">Note <span class="muted">(optional)</span></label>
        <input id="f_rn" class="input" value="${esc(r.note||'')}" placeholder="e.g. Initial lease, Annual increase, New tenant"></div>
    </div>`,
    `<button class="btn" data-close>Cancel</button>
     <button class="btn primary" onclick="assetRentalSave('${assetId}',${i==null?'null':i})">Save</button>`);
  setTimeout(rentalCalcPreview,30);
}
function rentalCalcPreview(){
  const el=$('#rentalPreview');if(!el)return;
  const a=num($('#f_ra').value),f=$('#f_rf').value,s=$('#f_rs').value;
  if(!a){el.innerHTML='';return;}
  const yearly=rentalYearly(a,f);
  const monthly=yearly/12;
  // Estimate FY income based on start date vs current FY
  const y=FY(),{start,end}=fyRange(y);
  const effStart=s&&s>start?s:start;
  const days=(new Date(end+'T00:00:00Z')-new Date(effStart+'T00:00:00Z'))/86400000;
  const fyEst=Math.max(0,a*(f==='weekly'?52:f==='fortnightly'?26:f==='monthly'?12:12)/365.25*days);
  el.innerHTML=`<b>${fmt$(a)}/${f}</b> = ${fmt$0(yearly)}/yr · ${fmt$0(monthly)}/mo avg${days>0&&s?` · <b>${fmt$0(fyEst)}</b> est. in ${esc(fyDisplay(y))} from ${fmtDate(s)}`:''}`;
}
function assetRentalSave(assetId, i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  a.rental=a.rental||{history:[]};
  const r={id:i!=null?a.rental.history[i].id:uid(),
    amount:num($('#f_ra').value),frequency:$('#f_rf').value,
    startDate:$('#f_rs').value||todayISO(),note:$('#f_rn').value.trim()};
  if(i!=null)a.rental.history[i]=r;else a.rental.history.push(r);
  save();closeModal();render();toast('Rental rate saved');
}
/* ---- Property management fee — % of rental income, tracked historically ---- */
function assetManagementFeeSection(a){
  const hist=(a.managementFeeHistory||[]).slice().sort((x,y)=>x.startDate<y.startDate?-1:1);
  const cur=managementFeeCurrentRate(a);
  const y=FY();
  const fyFee=managementFeeForFY(a,y);
  const rows=hist.map((h,i)=>{
    const isActive=h.startDate<=todayISO()&&(!hist[i+1]||hist[i+1].startDate>todayISO());
    return `<tr><td>${fmtDate(h.startDate)}${isActive?` <span class="badge euc" style="font-size:.65rem">current</span>`:''}</td>
      <td class="num">${h.pct}%</td><td>${esc(h.note||'')}</td>
      <td class="rowact"><button class="btn ghost small" onclick="assetMgmtFeeAdd('${a.id}',${i})">Edit</button>
        <button class="btn ghost small" onclick="confirmDel('Delete this fee rate?',()=>{DB.assets.find(x=>x.id==='${a.id}').managementFeeHistory.splice(${i},1);save();render()})">✕</button></td></tr>`;
  }).join('');
  return `<div class="mt">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px">
      <h3 style="font-size:.92rem">Property management fee</h3>
      <span style="display:flex;gap:8px;align-items:center">
        ${cur?`<span class="muted" style="font-size:.84rem">${cur.pct}% of rent currently</span>`:''}
        ${fyFee>0?`<span class="badge gold">${fmt$0(fyFee)} in ${esc(fyDisplay(y))}</span>`:''}
        ${isAll()?'':`<button class="btn small primary" onclick="assetMgmtFeeAdd('${a.id}')">+ ${hist.length?'Add rate change':'Set management fee'}</button>`}
      </span>
    </div>
    ${rows?`<table class="tbl"><thead><tr><th>Effective from</th><th class="num">Fee %</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      :`<div class="hint">Not yet set — if a property manager handles this rental, record their fee % here. It's automatically included as a deductible expense each FY based on that year's rental income, without you needing to add it manually.</div>`}
    ${fyFee>0?`<div class="note" style="margin-top:8px">This fee (<b>${fmt$0(fyFee)}</b> for ${esc(fyDisplay(y))}, at ${managementFeeRateAt(a,fyRange(y).end)}% of rent) is included automatically as a deduction — no need to add it as a separate property expense.</div>`:''}
  </div>`;
}
function assetMgmtFeeAdd(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  a.managementFeeHistory=a.managementFeeHistory||[];
  const isFirst=i==null&&!a.managementFeeHistory.length;
  const earliestRental=(a.rental?.history||[]).slice().sort((x,y)=>x.startDate<y.startDate?-1:1)[0];
  const defaultStart=(isFirst&&(a.purchaseDate||earliestRental?.startDate))||todayISO();
  const h=i!=null?a.managementFeeHistory[i]:{pct:'',startDate:defaultStart,note:''};
  modal(i!=null?'Edit management fee rate':'Set management fee',`
    <div class="fldrow">
      <div><label class="fld">Fee (% of rental income)</label><input id="f_mp" class="input money" value="${h.pct}" placeholder="e.g. 7.7"></div>
      <div><label class="fld">Effective from</label><input id="f_ms" type="date" class="input" value="${h.startDate}"></div>
    </div>
    <div class="fldrow mt"><div style="flex:2"><label class="fld">Note <span class="muted">(optional)</span></label>
      <input id="f_mn" class="input" value="${esc(h.note||'')}" placeholder="e.g. Switched to Ray White property management"></div></div>
    <div class="hint mt">This is applied automatically against each FY's rental income as a deductible expense — typical residential property management fees in Australia range from 5% to 12%.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="assetMgmtFeeSave('${assetId}',${i==null?'null':i})">Save</button>`);
}
function assetMgmtFeeSave(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  a.managementFeeHistory=a.managementFeeHistory||[];
  const h={pct:num($('#f_mp').value),startDate:$('#f_ms').value||todayISO(),note:$('#f_mn').value.trim()};
  if(i!=null)a.managementFeeHistory[i]=h;else a.managementFeeHistory.push(h);
  save();closeModal();render();toast('Management fee rate saved');
}
/* ---- Depreciation schedule (Div43 capital works + Div40 plant & equipment),
   manually entered per FY from a quantity surveyor report ---- */
function assetDepreciationSection(a){
  const rows=(a.depreciationSchedule||[]).slice().sort((x,y)=>x.fy-y.fy);
  const y=FY();
  const fyDep=depreciationForFY(a,y);
  const total=rows.reduce((s,r)=>s+num(r.capitalWorks)+num(r.plantEquipment),0);
  const expanded=ASSET_DEP_EXPANDED.has(a.id);
  const rowsHtml=rows.map((r,i)=>{
    const fyObj=yearByOrderYear(r.fy);
    const label=fyObj?fyDisplay(fyObj):'FY'+String(r.fy).slice(2)+'–'+String(r.fy+1).slice(2);
    return `<tr><td>${esc(label)}${fyObj?'':' <span class="badge gold" style="font-size:.65rem">not created yet</span>'}<div class="muted" style="font-size:.72rem">1 Jul ${r.fy} – 30 Jun ${r.fy+1}</div></td><td class="num">${fmt$(r.capitalWorks)}</td><td class="num">${fmt$(r.plantEquipment)}</td><td class="num"><b>${fmt$(num(r.capitalWorks)+num(r.plantEquipment))}</b></td>
      <td class="rowact"><button class="btn ghost small" onclick="assetDepRowAdd('${a.id}',${i})">Edit</button>
      <button class="btn ghost small" onclick="confirmDel('Delete this depreciation row?',()=>{DB.assets.find(x=>x.id==='${a.id}').depreciationSchedule.splice(${i},1);save();render()})">✕</button></td></tr>`;
  }).join('');
  const chart=rows.length>1?lineChartSVG(rows.map(r=>{
    const fyObj=yearByOrderYear(r.fy);
    return {label:fyObj?fyDisplay(fyObj):'FY'+r.fy,value:num(r.capitalWorks)+num(r.plantEquipment)};
  }),{aria:'Depreciation schedule by FY'}):'';
  return `<div class="mt">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px;cursor:pointer" onclick="assetDepToggle('${a.id}')">
      <h3 style="font-size:.92rem"><span style="display:inline-block;width:1em">${expanded?'▾':'▸'}</span>Depreciation schedule</h3>
      <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${fyDep>0?`<span class="badge gold">${fmt$0(fyDep)} in ${esc(fyDisplay(y))}</span>`:''}
        ${rows.length?`<span class="muted" style="font-size:.8rem">${fmt$0(total)} total scheduled</span>`:''}
        ${isAll()||!expanded?'':`<button class="btn ghost small" onclick="event.stopPropagation();assetDepBulkAdd('${a.id}')">+ Bulk add years</button>
        <button class="btn small primary" onclick="event.stopPropagation();assetDepRowAdd('${a.id}')">+ Add FY row</button>`}
      </span>
    </div>
    ${expanded?`${chart?`<div class="mt">${chart}</div>`:''}
    ${rowsHtml?`<table class="tbl mt"><thead><tr><th>Financial year</th><th class="num">Capital works (Div43)</th><th class="num">Plant & equipment (Div40)</th><th class="num">Total</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table>`
      :`<div class="hint">Enter the per-FY amounts from your quantity surveyor's depreciation report (e.g. the Capital Works Schedule and Capital Loss Schedule pages). Use <b>Bulk add years</b> for a run of identical amounts, then add the partial first/last years individually.</div>`}`:''}
    ${fyDep>0?`<div class="note" style="margin-top:8px">This depreciation (<b>${fmt$0(fyDep)}</b> for ${esc(fyDisplay(y))}) is included automatically as a deduction — no need to add it as a separate property expense.</div>`:''}
  </div>`;
}
function assetDepToggle(assetId){
  if(ASSET_DEP_EXPANDED.has(assetId))ASSET_DEP_EXPANDED.delete(assetId);else ASSET_DEP_EXPANDED.add(assetId);
  render();
}
function assetDepRowAdd(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  a.depreciationSchedule=a.depreciationSchedule||[];
  const r=i!=null?a.depreciationSchedule[i]:{fy:DB.currentFY!=='all'?fyOrderYear(FY()):fyOrderYear(Object.values(DB.years)[0]),capitalWorks:'',plantEquipment:''};
  modal(i!=null?'Edit depreciation row':'Add depreciation row',`
    <div class="fldrow"><div><label class="fld">Financial year starting</label><input id="f_dfy" class="input money" value="${r.fy}" placeholder="e.g. 2023 for FY23–24" oninput="assetDepFYPreview()"></div></div>
    <div class="hint" id="depFYPreview" style="margin-top:4px"></div>
    <div class="fldrow mt">
      <div><label class="fld">Capital works (Div43)</label><input id="f_dcw" class="input money" value="${r.capitalWorks}" placeholder="e.g. 6355"></div>
      <div><label class="fld">Plant & equipment (Div40)</label><input id="f_dpe" class="input money" value="${r.plantEquipment}" placeholder="e.g. 0"></div>
    </div>
    <div class="hint mt">From your report's Capital Works Schedule (Div43) and Capital Loss Schedule (Div40, if eligible — second-hand plant & equipment in residential properties is often not eligible if acquired after 9 May 2017). You can enter a financial year you haven't created in the app yet — the schedule applies automatically once that FY exists.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="assetDepRowSave('${assetId}',${i==null?'null':i})">Save</button>`);
  setTimeout(assetDepFYPreview,30);
}
function assetDepFYPreview(){
  const el=$('#depFYPreview');if(!el)return;
  const fy=num($('#f_dfy').value);
  if(!fy){el.textContent='';return;}
  const existing=yearByOrderYear(fy);
  const dateRange=`1 Jul ${fy} – 30 Jun ${fy+1}`;
  el.innerHTML=existing
    ?`= <b>${esc(fyDisplay(existing))}</b> <span class="muted">(${dateRange})</span>`
    :`= ${dateRange} <span class="muted">(not created as a financial year in this app yet — will apply automatically once you create it in Tax settings)</span>`;
}
function assetDepRowSave(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  a.depreciationSchedule=a.depreciationSchedule||[];
  const fy=num($('#f_dfy').value);
  const r={fy,capitalWorks:num($('#f_dcw').value)||0,plantEquipment:num($('#f_dpe').value)||0};
  if(i!=null)a.depreciationSchedule[i]=r;
  else{
    const existing=a.depreciationSchedule.findIndex(x=>x.fy===fy);
    if(existing>=0)a.depreciationSchedule[existing]=r;else a.depreciationSchedule.push(r);
  }
  save();closeModal();render();toast('Depreciation row saved');
}
function assetDepBulkAdd(assetId){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const defaultFrom=DB.currentFY!=='all'?fyOrderYear(FY()):fyOrderYear(Object.values(DB.years).sort((a,b)=>fyOrderYear(a)-fyOrderYear(b))[0]);
  modal('Bulk add depreciation years',`
    <div class="hint">Quickly fill a run of financial years with the same amount — useful for the many identical years a straight-line capital works schedule produces (e.g. $6,355/yr for 26 years). You can still edit or override individual years afterward.</div>
    <div class="fldrow mt">
      <div><label class="fld">From FY starting</label><input id="f_bfrom" class="input money" value="${defaultFrom}" placeholder="e.g. 2024 for FY24–25" oninput="assetDepBulkPreview()"></div>
      <div><label class="fld">Number of years</label><input id="f_bn" class="input money" value="5" placeholder="e.g. 26" oninput="assetDepBulkPreview()"></div>
    </div>
    <div class="hint" id="depBulkPreview" style="margin-top:4px"></div>
    <div class="fldrow mt">
      <div><label class="fld">Capital works (Div43) per year</label><input id="f_bcw" class="input money" placeholder="e.g. 6355"></div>
      <div><label class="fld">Plant & equipment (Div40) per year</label><input id="f_bpe" class="input money" placeholder="e.g. 0"></div>
    </div>
    <div class="note mt">Years beyond your currently created financial years will be scheduled but won't show as a deduction until you create those FYs in Tax settings — the schedule will be there waiting.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="assetDepBulkSave('${assetId}')">Add years</button>`);
  setTimeout(assetDepBulkPreview,30);
}
function assetDepBulkPreview(){
  const el=$('#depBulkPreview');if(!el)return;
  const fromFY=num($('#f_bfrom').value),n=Math.max(1,num($('#f_bn').value)||1);
  if(!fromFY){el.textContent='';return;}
  const lbl=fy=>{const ex=yearByOrderYear(fy);return ex?fyDisplay(ex):`1 Jul ${fy}\u201330 Jun ${fy+1}`;};
  el.innerHTML=n>1?`= ${lbl(fromFY)} through ${lbl(fromFY+n-1)} (${n} years)`:`= ${lbl(fromFY)}`;
}
function assetDepBulkSave(assetId){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  a.depreciationSchedule=a.depreciationSchedule||[];
  const fromFY=num($('#f_bfrom').value);
  const n=Math.max(1,num($('#f_bn').value)||1);
  const cw=num($('#f_bcw').value)||0;
  const pe=num($('#f_bpe').value)||0;
  let added=0;
  for(let k=0;k<n;k++){
    const fy=fromFY+k;
    const existing=a.depreciationSchedule.findIndex(x=>x.fy===fy);
    const row={fy,capitalWorks:cw,plantEquipment:pe};
    if(existing>=0)a.depreciationSchedule[existing]=row;else a.depreciationSchedule.push(row);
    added++;
  }
  save();closeModal();render();toast(`${added} year${added>1?'s':''} added to the depreciation schedule`);
}
/* Cashflow (rent vs total expenses) and gearing (rent vs deductible
   expenses) for a property asset, for the current financial year. */
function assetCashflowSection(a){
  const pid=isAll()?a.pid:DB.currentPid;
  const y=FY();
  if(!y)return'';
  const B=bucket(y,pid);
  const hasAnyData=(a.rental?.history||[]).length||B.property.expenses.length||(a.depreciationSchedule||[]).length||(a.managementFeeHistory||[]).length||(a.costs||[]).length;
  if(!hasAnyData)return'';

  // Cash figures — what actually hits the bank account
  const rentM=rentalIncomeMonthlyForFY(a,y);
  const cashExpM=propertyExpensesMonthlyForFY(y,[pid]); // cash expenses + mgmt fee spread monthly
  const cashNetM=rentM.map((v,i)=>v-cashExpM[i]);
  const rentFY=rentM.reduce((s,v)=>s+v,0);
  const cashExpFY=cashExpM.reduce((s,v)=>s+v,0);
  const cashflow=rentFY-cashExpFY; // actual cash in/out

  // Total deduction picture (for gearing/tax) — includes non-cash items
  const cashDed=B.property.expenses.reduce((s,e)=>s+propExpDeductible(e),0);
  const mgmtFee=managementFeeForFY(a,y);
  const costSpread=costScheduleForFY(a,y);
  const depreciation=depreciationForFY(a,y);
  const nonCashDed=costSpread+mgmtFee+depreciation;
  const totalDed=cashDed+nonCashDed;
  const gearing=rentFY-totalDed; // negative = negatively geared (tax loss)

  // Chart: monthly net (rent minus cash expenses) — real money flow
  const pts=FY_MONTHS.map((label,i)=>({label,value:cashNetM[i]}));

  // Break down deductions for the tooltip table
  const dedBreakdown=[
    cashDed?`Cash expenses ${fmt$0(cashDed)}`:'',
    mgmtFee?`Mgmt fee ${fmt$0(mgmtFee)}`:'',
    costSpread?`Borrowing cost spread ${fmt$0(costSpread)}`:'',
    depreciation?`Depreciation ${fmt$0(depreciation)}`:'',
  ].filter(Boolean).join(' · ');

  return `<div class="mt">
    <h3 style="font-size:.92rem">Cashflow &amp; gearing — ${esc(fyDisplay(y))}</h3>
    <div class="grid3" style="margin:8px 0">
      <div class="stat ${cashflow>=0?'good':'bad'}"><div class="l">Net cashflow</div><div class="v">${fmt$0(Math.abs(cashflow))}</div><div class="d">${cashflow>=0?'cash positive':'cash negative'} · rent ${fmt$0(rentFY)} vs expenses ${fmt$0(cashExpFY)}</div></div>
      <div class="stat ${gearing>=0?'good':'bad'}"><div class="l">Gearing (tax position)</div><div class="v">${fmt$0(Math.abs(gearing))}</div><div class="d">${gearing>=0?'positively geared — extra taxable income':'negatively geared — tax-deductible loss'}</div></div>
      <div class="stat"><div class="l">Rent vs total deductions</div><div class="v" style="font-size:1.05rem">${fmt$0(rentFY)} <span class="muted">vs</span> ${fmt$0(totalDed)}</div><div class="d">${dedBreakdown||'no deductions recorded'}</div></div>
    </div>
    <div class="cbody" style="padding:0">${lineChartSVG(pts,{aria:'Net monthly cashflow'})}</div>
    <div class="note" style="margin-top:8px">
      <b>Cashflow</b> is cash in/out — rent minus actual cash expenses (repairs, rates, interest etc.). <b>Gearing</b> is your tax position — rent minus <em>all</em> deductions including non-cash items (depreciation <b>${fmt$0(depreciation)}</b>, borrowing cost spread <b>${fmt$0(costSpread)}</b>, management fee <b>${fmt$0(mgmtFee)}</b>). A negative gearing figure is the tax-deductible loss that offsets your other income.
    </div>
  </div>`;
}
/* ---- Investment property offset account calculator ---- */
function assetOffsetSection(a){
  if(a.kind!=='property')return'';
  const pid=a.pid||DB.people[0].id;
  const loan=DB.nw.items.find(it=>it.assetId===a.id&&it.kind==='liability');

  if(!loan)return`<div class="note mt" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
    <span>No loan linked to this property yet — create one to unlock the offset calculator.</span>
    <button class="btn small primary" onclick="assetCreateLoan('${a.id}')">+ Create home loan</button>
  </div>`;

  const offsetItem=loan.offsetItemId?DB.nw.items.find(x=>x.id===loan.offsetItemId):null;
  if(!offsetItem){
    const existingOffsets=DB.nw.items.filter(x=>(x.kind==='savings'||x.kind==='offset')&&x.pid===pid);
    const linkOpts=existingOffsets.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
    return`<div class="note mt">
      <b>Loan linked</b> (${esc(loan.name)}) but no offset account attached yet.
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">
        <button class="btn small primary" onclick="assetCreateOffset('${a.id}','${loan.id}')">+ Create offset account</button>
        ${linkOpts?`<select id="offsetLinkSel-${a.id}" class="input" style="max-width:220px"><option value="">or link existing ↓</option>${linkOpts}</select>
          <button class="btn small" onclick="assetLinkOffset('${loan.id}','offsetLinkSel-${a.id}')">Link</button>`:''}
      </div>
    </div>`;
  }

  const cutoff=(()=>{const fyEnd=isAllFY()?todayISO():fyRange(FY()).end;const today=todayISO();return fyEnd<today?fyEnd:today;})();
  const rate=loanRateAt(loan,cutoff);
  if(!rate)return`<div class="note mt" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
    <span>Offset account linked but no interest rate set on the loan.</span>
    <button class="btn small" onclick="nwItemAdd('${loan.id}')">Edit loan ↗</button>
  </div>`;

  const pct=num(loan.offsetPct)||100;
  const loanBal=Math.abs(nwValueAt(loan.id,cutoff)||0);
  const offsetBalRaw=Math.max(0,nwValueAt(offsetItem.id,cutoff)||0);
  const offsetBal=offsetBalRaw*pct/100;
  const effBal=Math.max(0,loanBal-offsetBal);
  const moSaving=offsetBal*rate/100/12;
  const termYrs=num(loan.loanTermYears)||0;
  const startDate=loan.loanStartDate||(a.purchaseDate||'');
  let remYrs=termYrs;
  if(termYrs&&startDate){
    const elapsed=(Date.now()-new Date(startDate+'T00:00:00Z').getTime())/(365.25*86400*1000);
    remYrs=Math.max(0,termYrs-elapsed);
  }
  const lifetimeSaving=remYrs>0?moSaving*remYrs*12:null;
  const isFrozenOffset=cutoff<todayISO();
  return`<h3 class="mt" style="font-size:.92rem">Offset account — ${esc(offsetItem.name)}${isFrozenOffset?` <span class="muted" style="font-size:.78rem;font-weight:400">as of ${fmtDate(cutoff)}</span>`:''}
    <button class="btn ghost small" style="font-size:.72rem;margin-left:8px" onclick="nwItemAdd('${loan.id}')">Edit loan ↗</button>
    <button class="btn ghost small" style="font-size:.72rem" onclick="nwEntryAdd('${offsetItem.id}')">Update offset balance ↗</button>
  </h3>
  <div class="grid3" style="margin:8px 0">
    <div class="stat"><div class="l">Offset balance${pct<100?` (${pct}% coverage)`:''}</div><div class="v">${fmt$0(offsetBalRaw)}</div><div class="d">${pct<100?`${pct}% eff. ${fmt$0(offsetBal)}`:'fully contributing'}</div></div>
    <div class="stat good"><div class="l">Interest saved / month</div><div class="v">${fmt$0(moSaving)}</div><div class="d">at ${rate}% on ${fmt$0(offsetBal)}</div></div>
    <div class="stat"><div class="l">Effective loan balance</div><div class="v">${fmt$0(effBal)}</div><div class="d">loan ${fmt$0(loanBal)} − offset ${fmt$0(offsetBal)}</div></div>
  </div>
  ${lifetimeSaving!=null?`<div class="kv"><span class="k">Approx. lifetime interest saving from current offset</span><span class="v" style="color:var(--euc);font-size:1.05rem">${fmt$0(lifetimeSaving)}</span></div>
  <div class="muted" style="font-size:.74rem;margin-bottom:8px">${remYrs.toFixed(1)} years remaining at ${rate}% — simplified estimate.</div>`:
  `<div class="muted mt" style="font-size:.8rem">${termYrs?'Set a loan start date on':'Set a loan term and start date on'} the loan — <button class="btn ghost small" onclick="nwItemAdd('${loan.id}')">Edit loan ↗</button></div>`}
  <div class="mt"><label class="fld" style="font-weight:600">Offset calculator</label>
    <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
      <input id="offsetCalcInput-${a.id}" class="input money" placeholder="Hypothetical offset balance" style="max-width:200px" oninput="assetOffsetCalc('${a.id}',${rate},${pct},${loanBal},${termYrs},${startDate?`'${startDate}'`:'null'})">
    </div>
    <div id="offsetCalcResult-${a.id}" style="margin-top:8px;font-size:.9rem"></div>
  </div>`;
}
/* ---- Create loan / offset NW items directly from the property asset card ---- */
function assetCreateLoan(assetId){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  const pid=a.pid||DB.people[0].id;
  modal('Add home loan',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Loan name</label><input id="f_n" class="input" value="${esc(a.name)+' — home loan'}" placeholder="e.g. ANZ Home Loan"></div></div>
    <div class="fldrow mt">
      <div><label class="fld">Interest rate (%)</label><input id="f_ir" class="input money" placeholder="e.g. 6.19"></div>
      <div><label class="fld">Loan term (years)</label><input id="f_term" class="input money" placeholder="e.g. 30"></div>
      <div><label class="fld">Loan start date</label><input id="f_lstart" type="date" class="input" value="${esc(a.purchaseDate||'')}"></div>
    </div>
    <div class="fldrow mt"><div><label class="fld">Current balance ($) — enter as positive</label><input id="f_bal" class="input money" placeholder="e.g. 650000"></div></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="assetCreateLoanSave('${assetId}','${pid}')">Create loan</button>`);
}
function assetCreateLoanSave(assetId,pid){
  const name=$('#f_n').value.trim()||'Home loan';
  const rate=num($('#f_ir').value)||'';
  const term=num($('#f_term').value)||'';
  const start=$('#f_lstart').value||'';
  const bal=num($('#f_bal').value);
  const item={id:uid(),pid,name,kind:'liability',assetId,interestRate:rate,offsetItemId:'',offsetPct:100,loanTermYears:term,loanStartDate:start};
  DB.nw.items.push(item);
  if(bal)DB.nw.entries.push({id:uid(),itemId:item.id,date:todayISO(),value:-Math.abs(bal)});
  save();closeModal();render();toast('Loan created — add an offset account below');
}
function assetCreateOffset(assetId,loanId){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;
  const pid=a.pid||DB.people[0].id;
  modal('Add offset account',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Account name</label><input id="f_n" class="input" value="Offset account" placeholder="e.g. ANZ Offset Account"></div></div>
    <div class="fldrow mt">
      <div><label class="fld">Current balance ($)</label><input id="f_bal" class="input money" placeholder="e.g. 50000"></div>
      <div><label class="fld">Coverage %</label><input id="f_opct" class="input money" value="100" placeholder="100"></div>
    </div>
    <div class="hint mt">Coverage % lets you model a partial offset — e.g. if only 80% of the balance is offset-eligible, enter 80.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="assetCreateOffsetSave('${loanId}','${pid}')">Create &amp; link</button>`);
}
function assetCreateOffsetSave(loanId,pid){
  const name=$('#f_n').value.trim()||'Offset account';
  const bal=num($('#f_bal').value);
  const pct=num($('#f_opct').value)||100;
  const item={id:uid(),pid,name,kind:'offset'};
  DB.nw.items.push(item);
  if(bal)DB.nw.entries.push({id:uid(),itemId:item.id,date:todayISO(),value:bal});
  const loan=DB.nw.items.find(x=>x.id===loanId);
  if(loan){loan.offsetItemId=item.id;loan.offsetPct=pct;}
  save();closeModal();render();toast('Offset account created and linked');
}
function assetLinkOffset(loanId,selId){
  const sel=document.getElementById(selId);if(!sel||!sel.value)return toast('Pick an account to link first');
  const loan=DB.nw.items.find(x=>x.id===loanId);if(!loan)return;
  loan.offsetItemId=sel.value;
  save();render();toast('Offset account linked');
}
function assetOffsetCalc(assetId,rate,pct,loanBal,termYrs,startDate){
  const el=document.getElementById('offsetCalcResult-'+assetId);if(!el)return;
  const inp=document.getElementById('offsetCalcInput-'+assetId);if(!inp)return;
  const hyp=num(inp.value);if(!hyp){el.innerHTML='';return;}
  const effOff=hyp*pct/100;
  const moSaving=effOff*rate/100/12;
  let remYrs=termYrs;
  if(termYrs&&startDate){
    const elapsed=(Date.now()-new Date(startDate+'T00:00:00Z').getTime())/(365.25*86400*1000);
    remYrs=Math.max(0,termYrs-elapsed);
  }
  const lifetime=remYrs>0?moSaving*remYrs*12:null;
  el.innerHTML=`<b>${fmt$(hyp)}</b> offset → <b>${fmt$(moSaving)}/mo</b> interest saving at ${rate}%`
    +(pct<100?` (${pct}% coverage → effective ${fmt$(effOff)})`:'')
    +(lifetime!=null?` · over ${remYrs.toFixed(1)} remaining years → ~<b>${fmt$(lifetime)} total</b>`:'')
    +`<div class="muted" style="font-size:.72rem;margin-top:3px">Simplified estimate — actual saving depends on amortisation schedule and rate changes.</div>`;
}
/* Expenses linked to this specific asset, plus a backward-compat fallback:
   expenses recorded before per-asset linking existed (no assetId) are shown
   here if this is the person's ONLY asset of this kind. Returns each
   expense with _i = its real index in B.property.expenses, for editing. */
function assetExpensesOf(B,a){
  const linked=B.property.expenses.map((e,i)=>({...e,_i:i})).filter(e=>e.assetId===a.id);
  if(linked.length)return linked;
  const sameKind=assetsForPerson([a.pid||DB.people[0].id]).filter(x=>assetGroupKind(x)===assetGroupKind(a));
  if(sameKind.length===1)return B.property.expenses.map((e,i)=>({...e,_i:i})).filter(e=>!e.assetId);
  return [];
}
function assetPropertyExpenses(a){
  // Inline per-FY expense section for an asset card (property or vehicle).
  const isVehicle=a.kind==='vehicle';
  const cats=expenseCatsFor(a);
  const pid=isAll()?a.pid:DB.currentPid;
  // Use the currently selected FY (no tab switcher — the user picks FY from the global FY picker)
  const activeY=FY();
  if(!activeY)return'<div class="muted">No financial years set up.</div>';
  const activeFYKey=fyOrderYear(activeY);
  const B=bucket(activeY,pid);
  const locked=activeY.locked;
  const myExpenses=assetExpensesOf(B,a);
  const byCat={};
  myExpenses.forEach(e=>{(byCat[e.category]=byCat[e.category]||[]).push(e);});
  let body='',totCash=0,totDed=0;
  cats.filter(c=>byCat[c]).forEach(c=>{
    const ct=byCat[c].reduce((s,e)=>s+num(e.amount),0);
    const ctDed=byCat[c].reduce((s,e)=>s+propExpDeductibleEffective(e,B,pid),0);
    totCash+=ct;totDed+=ctDed;
    body+=`<tr class="subhead"><td>${c}</td><td></td><td></td><td class="num">${fmt$(ct)}</td><td class="num">${fmt$(ctDed)}</td><td></td><td></td></tr>`;
    body+=byCat[c].map(e=>{
      const included=leaseIncludesExpense(e,B,pid);
      const ded=propExpDeductibleEffective(e,B,pid),full=num(e.amount);
      const dedCell=included?'<span class="badge gold" style="font-size:.68rem">novated lease</span>':ded>=full?'<span class="muted">fully</span>':ded<=0?'<span class="muted">none</span>':fmt$(ded);
      return `<tr><td></td><td>${fmtDate(e.date)}</td><td>${esc(e.item||'')}</td>
      <td class="num">${fmt$(e.amount)}</td>
      <td class="num">${dedCell}</td>
      <td>${e.receiptId?`<span class="rcpt-file" onclick="rcptView('${e.receiptId}','${esc(e.item||c)}')">📎 ${esc(e.receiptName||'receipt')}</span>`:'<span class="muted">—</span>'}</td>
      <td class="rowact">${locked?'':
        `<button class="btn ghost small" onclick="propCtxAdd('${a.id}',${activeFYKey},'${pid}',${e._i})">Edit</button>
         <button class="btn ghost small" onclick="propCtxDel('${a.id}',${activeFYKey},'${pid}',${e._i})">✕</button>`
      }</td></tr>`;}).join('');
  });
  // Management fee — computed row (% of rent, fully deductible)
  if(!isVehicle&&a.kind==='property'){
    const mgmtFee=managementFeeForFY(a,activeY);
    const curRate=managementFeeCurrentRate(a);
    if(mgmtFee>0){
      totCash+=mgmtFee;totDed+=mgmtFee;
      body+=`<tr class="subhead"><td>Property management fees</td><td></td><td></td><td class="num">${fmt$(mgmtFee)}</td><td class="num">${fmt$(mgmtFee)}</td><td></td><td></td></tr>
      <tr><td></td><td colspan="2"><span class="muted" style="font-size:.82rem">Auto-calculated — ${curRate?curRate.pct+'% of rental income':'see management fee rate'}</span></td>
        <td class="num">${fmt$(mgmtFee/12)}<span class="muted">/mo</span></td><td class="num"><span class="muted">fully</span></td>
        <td colspan="2"><a href="#" onclick="event.stopPropagation()" style="font-size:.78rem" title="Edit fee rate via management fee section above">auto</a></td>
      </tr>`;
    }
  }
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;margin-bottom:12px">
    ${locked?'':`<button class="btn small primary" onclick="propCtxAdd('${a.id}',${activeFYKey},'${pid}',null)">+ Add ${isVehicle?'vehicle':'property'} expense</button>`}
    ${locked||isVehicle?'':`<button class="btn small" onclick="propMortgageBulkAdd('${a.id}',${activeFYKey},'${pid}')">+ Set up mortgage repayments</button>`}</div>
  <table class="tbl"><thead><tr><th>Category</th><th>Date</th><th>Detail</th><th class="num">Amount</th><th class="num">Deductible</th><th>Receipt</th><th></th></tr></thead>
  <tbody>${body||'<tr><td colspan="7" class="muted">No expenses for '+(esc(fyDisplay(activeY)))+' yet.</td></tr>'}
  ${totCash?`<tr class="total"><td colspan="3">Total ${esc(fyDisplay(activeY))}</td><td class="num">${fmt$(totCash)}</td><td class="num">${fmt$(totDed)}</td><td colspan="2"></td></tr>`:''}
  </tbody></table>
  ${totCash&&totDed<totCash?`<div class="note" style="margin-top:8px">Only the <b>Deductible</b> amount is included in your tax deductions — e.g. for a mortgage repayment, that's the interest portion only, not the principal${isVehicle?', and amounts tagged "novated lease" are already excluded since they\u2019re paid via salary sacrifice':''}. Set this per-expense via Edit.</div>`:''}`;
}
/* Bulk-generates individual "Mortgage Repayment" expense rows on a
   recurring interval (e.g. monthly), each with its own editable amount
   and interest (deductible) component — since the interest portion
   typically changes slightly every repayment as the loan amortises.
   Rows remain individually editable afterward via the normal Edit flow. */
function propMortgageBulkAdd(assetId,fyKey,pid){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const y=yearByOrderYear(num(fyKey))||FY();
  const isPPOR=a&&a.kind==='property'&&a.investment===false;
  modal('Set up mortgage repayments',`
    <div class="hint">Generates one expense row per repayment for ${esc(fyDisplay(y))} — each stays individually editable afterward${isPPOR?'':', since the interest portion usually shifts slightly with every repayment as the loan amortises'}.</div>
    <div class="fldrow mt">
      <div><label class="fld">First repayment date</label><input id="f_mstart" type="date" class="input" value="${fyRange(y).start}"></div>
      <div><label class="fld">Interval</label><select id="f_mint" class="input">
        <option value="monthly">Monthly</option><option value="fortnightly">Fortnightly</option><option value="weekly">Weekly</option></select></div>
      <div><label class="fld">Number of repayments</label><input id="f_mn" class="input money" value="12" placeholder="e.g. 12"></div>
    </div>
    <div class="fldrow mt">
      <div><label class="fld">Repayment amount ($) — default</label><input id="f_mamt" class="input money" placeholder="e.g. 2400"></div>
      ${isPPOR?'':`<div><label class="fld">Interest component ($) — default, deductible</label><input id="f_mint_amt" class="input money" placeholder="e.g. 1100"></div>`}
    </div>
    <div class="hint mt">${isPPOR?"This is a home loan, so the interest portion isn't tax-deductible — these rows are tracked for your own budgeting only.":'These defaults are applied to every generated row — edit each one afterward if the interest portion varies month to month (it almost always does).'}</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="propMortgageBulkSave('${assetId}',${fyKey},'${pid}')">Generate rows</button>`);
}
function propMortgageBulkSave(assetId,fyKey,pid){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const y=yearByOrderYear(num(fyKey))||FY();
  const B=bucket(y,pid);
  const start=$('#f_mstart').value||fyRange(y).start;
  const interval=$('#f_mint').value;
  const n=Math.max(1,num($('#f_mn').value)||1);
  const amt=num($('#f_mamt').value)||0;
  const intField=$('#f_mint_amt');
  const intAmt=intField?(num(intField.value)||0):0;
  const stepDays=interval==='weekly'?7:interval==='fortnightly'?14:null;
  let d=new Date(start+'T00:00:00Z');
  let added=0;
  for(let k=0;k<n;k++){
    const date=iso(d);
    B.property.expenses.push({id:uid(),date,category:'Mortgage Repayment',item:`Repayment ${k+1}`,amount:amt,deductibleAmount:intAmt,assetId});
    if(stepDays)d=new Date(d.getTime()+stepDays*86400000);
    else{d=new Date(d);d.setUTCMonth(d.getUTCMonth()+1);}
    added++;
  }
  save();closeModal();render();toast(`${added} mortgage repayment rows added — edit each one's interest component as needed`);
}
/* Populates the Version history card on Settings — async since it needs a
   Drive API call to list files in Ledger/versions/. Collapsed to just the
   most recent snapshot by default (this list grows by ~1/day for up to 3
   months, so showing everything would make Settings unwieldy); "Show all"
   expands it. */
let VERSION_HISTORY_CACHE=null,VERSION_HISTORY_EXPANDED=false;
async function renderVersionHistory(){
  const el=$('#versionHistory');if(!el)return;
  el.innerHTML='<div class="muted">Loading…</div>';
  VERSION_HISTORY_CACHE=await listVersions();
  renderVersionHistoryList();
}
function renderVersionHistoryList(){
  const el=$('#versionHistory');if(!el)return;
  const versions=VERSION_HISTORY_CACHE||[];
  if(!versions.length){
    el.innerHTML='<div class="muted">No snapshots yet — one is taken automatically the first time you save on a new day. Snapshots are kept for 3 months.</div>';
    return;
  }
  const shown=VERSION_HISTORY_EXPANDED?versions:versions.slice(0,1);
  el.innerHTML=`
    <div class="hint" style="margin-bottom:8px">A snapshot of your data is saved automatically the first time you save each day — so you can always undo a bad edit by reverting to an earlier day. Snapshots are kept for 3 months, then purged automatically.</div>
    ${shown.map(v=>`<div class="kv"><span class="k">${esc(v.label)}</span>
      <button class="btn ghost small" onclick="confirmAction('Revert to this version?','Revert to <b>${esc(v.label)}</b>? Your current data will be saved as a snapshot first, so you can undo this too.','Revert',()=>revertToVersion('${esc(v.name)}'))">Revert</button></div>`).join('')}
    ${versions.length>1?`<div class="kv" style="border-top:1px solid var(--line2);padding-top:8px;margin-top:4px"><span></span><button class="btn ghost small" onclick="VERSION_HISTORY_EXPANDED=!VERSION_HISTORY_EXPANDED;renderVersionHistoryList()">${VERSION_HISTORY_EXPANDED?'Show less':`Show all ${versions.length} snapshots`}</button></div>`:''}`;
}
function propCtxAdd(assetId,fyKey,pid,i){
  PROP_CTX={fyKey:String(fyKey),pid,assetId};
  propAdd(i);
  // Register a cleanup so dismissing the modal (data-close) also clears
  // the context — otherwise it bleeds into the next unrelated propAdd call.
  const cleanup=()=>{PROP_CTX=null;};
  const btn=$('#modalRoot')?.querySelector('[data-close]');
  if(btn)btn.addEventListener('click',cleanup,{once:true});
  // Also clear on the Cancel button if it was set explicitly
  document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){PROP_CTX=null;document.removeEventListener('keydown',esc);}},{once:true});
}
async function propCtxDel(assetId,fyKey,pid,i){
  PROP_CTX={fyKey:String(fyKey),pid,assetId};
  confirmDel('Delete this expense?',async()=>{await propDelete(i);PROP_CTX=null;});
}
function assetsForPerson(pids){return(DB.assets||[]).filter(a=>pids.includes(a.pid||DB.people[0].id));}
/* Fully removes an asset and everything tied to it:
   - Linked net worth items (valuations/loans) AND their value-history entries
   - Dividends / fund distributions / fund ATO-label records across every FY
     that reference this asset are DELETED (not just unlinked) — the asset
     no longer exists, so its income history goes with it.
   For shares/managed funds, transactions live ON the asset so they're removed
   automatically with it. assetDeleteCascade does the data mutation only (no
   save/render), so it can be batched for multi-select delete. */
function assetDeleteCascade(assetId){
  const itemIds=new Set(DB.nw.items.filter(it=>it.assetId===assetId).map(it=>it.id));
  DB.nw.entries=DB.nw.entries.filter(e=>!itemIds.has(e.itemId));
  DB.nw.items=DB.nw.items.filter(it=>it.assetId!==assetId);
  Object.values(DB.years).forEach(y=>{
    Object.values(y.people||{}).forEach(b=>{
      b.dividends=(b.dividends||[]).filter(d=>d.assetId!==assetId);
      b.funds=(b.funds||[]).filter(f=>f.assetId!==assetId);
      b.fundPayments=(b.fundPayments||[]).filter(p=>p.assetId!==assetId);
      (b.preTaxDeds||[]).forEach(r=>{if(r.vehicleId===assetId){delete r.vehicleId;delete r.includedExpenseCategories;}});
    });
  });
  DB.assets=DB.assets.filter(x=>x.id!==assetId);
}
function assetDelete(assetId){assetDeleteCascade(assetId);save();render();}
function assetToggleSelect(id,checked){
  if(checked)ASSET_SELECTED.add(id);else ASSET_SELECTED.delete(id);
  render();
}
function assetGroupSelectAll(ids,checked){
  ids.forEach(id=>{if(checked)ASSET_SELECTED.add(id);else ASSET_SELECTED.delete(id);});
  render();
}
function assetDeleteSelected(){
  if(!ASSET_SELECTED.size)return;
  const n=ASSET_SELECTED.size;
  confirmDel(`Delete ${n} selected asset${n===1?'':'s'}? This also deletes their transactions, linked net worth items, and every dividend/distribution recorded against them across all financial years. This can't be undone.`,()=>{
    ASSET_SELECTED.forEach(id=>assetDeleteCascade(id));
    ASSET_SELECTED.clear();save();render();toast(`Deleted ${n} asset${n===1?'':'s'}`);
  });
}
/* ---- Share / ETF / managed fund helpers ---- */
/* Units held as of a date. Normally just sums buy/sell transactions, but
   a "checkpoint" transaction — synced automatically from a dividend
   statement's stated unit count — resets the running total as of its
   date, so the figure stays correct even when buy/sell history is
   incomplete. The most recent checkpoint at or before upToDate wins;
   only buy/sell transactions AFTER that checkpoint are added on top. */
function assetHeldQty(a, upToDate){
  const all=(a.transactions||[]).filter(t=>!upToDate||t.date<=upToDate);
  const checkpoints=all.filter(t=>t.type==='checkpoint').sort((x,y)=>x.date<y.date?-1:1);
  const latest=checkpoints.length?checkpoints[checkpoints.length-1]:null;
  const startQty=latest?num(latest.qty):0;
  const fromDate=latest?latest.date:null;
  const rest=all.filter(t=>t.type!=='checkpoint'&&(!fromDate||t.date>fromDate));
  return rest.reduce((s,t)=>t.type==='sell'?s-num(t.qty):s+num(t.qty),startQty);
}
/* Creates or updates a checkpoint transaction for an asset at a given
   date with the unit count confirmed by a dividend/distribution
   statement — keeping "units held" accurate even when the user hasn't
   logged every buy/sell. Re-importing the same statement updates the
   existing checkpoint rather than duplicating it. */
function assetSyncQtyCheckpoint(assetId,date,qty){
  if(!assetId||!date||!qty)return;
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  a.transactions=a.transactions||[];
  const existing=a.transactions.find(t=>t.type==='checkpoint'&&t.date===date);
  if(existing)existing.qty=qty;
  else a.transactions.push({id:uid(),type:'checkpoint',date,qty,source:'dividend statement'});
}
function txCostBasis(txs){
  // Average cost method (FIFO preferred for CGT but this is indicative)
  let totalQty=0,totalCost=0;
  txs.forEach(t=>{
    if(t.type==='checkpoint')return; // unit-count calibration only, no cost data
    const qty=num(t.qty),price=num(t.price),fees=num(t.fees||0);
    if(t.type==='sell'){const avg=totalQty?totalCost/totalQty:0;totalCost-=avg*qty;totalQty-=qty;}
    else{totalCost+=qty*price+fees;totalQty+=qty;}
  });
  return Math.max(0,totalCost);
}
function assetCostBasis(a, upToDate){
  const txs=(a.transactions||[]).filter(t=>!upToDate||t.date<=upToDate);
  return txCostBasis(txs);
}
function assetLastPrice(a){return a.lastPrice?num(a.lastPrice.price):null;}
function assetCurrentValue(a){const p=assetLastPrice(a);const q=assetHeldQty(a);return p&&q?p*q:null;}

function assetAdd(id){
  const a=id?DB.assets.find(x=>x.id===id):{name:'',kind:'property',address:'',url:'',purchaseDate:'',purchasePrice:'',code:''};
  const isShare=a.kind==='shares'||a.kind==='managed_fund';
  modal(id?'Edit asset':'Add asset',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Name</label><input id="f_n" class="input" value="${esc(a.name)}" placeholder="e.g. 12 Smith St, ANZ shares, VAS ETF"></div>
    <div><label class="fld">Type</label><select id="f_k" class="input" onchange="assetKindChange(this.value)">
      <option value="shares"       ${a.kind==='shares'?'selected':''}>Shares</option>
      <option value="managed_fund" ${a.kind==='managed_fund'?'selected':''}>ETF / Managed Fund</option>
      <option value="property"     ${a.kind==='property'?'selected':''}>Property</option>
      <option value="vehicle"      ${a.kind==='vehicle'?'selected':''}>Vehicle</option>
      <option value="ff_points"    ${a.kind==='ff_points'?'selected':''}>Frequent Flyer points</option>
      <option value="other"        ${a.kind==='other'?'selected':''}>Other asset</option></select></div></div>
    <!-- Share / ETF fields -->
    <div id="assetShareFlds" style="display:${isShare?'block':'none'}" class="mt">
      <div class="fldrow">${secSearchBox('#f_code','#f_n')}
        <div><label class="fld">ASX / fund code</label><input id="f_code" class="input" value="${esc(a.code||'')}" style="text-transform:uppercase" placeholder="e.g. VAS, ANZ"></div></div>
      <div class="fldrow mt"><div><label class="fld">Platform <span class="muted">(optional)</span></label>
        <select id="f_plat" class="input" onchange="if(this.value==='__custom__'){this.style.display='none';document.getElementById('f_plat_custom').style.display='';document.getElementById('f_plat_custom').focus();}">
          <option value="">— none —</option>
          ${(DB.platforms||[]).map(p=>`<option value="${esc(p)}" ${a.platform===p?'selected':''}>${esc(p)}</option>`).join('')}
          <option value="__custom__" ${a.platform&&!(DB.platforms||[]).includes(a.platform)?'selected':''}>+ Type a new platform…</option>
        </select>
        <input id="f_plat_custom" class="input mt" placeholder="New platform name" style="display:${a.platform&&!(DB.platforms||[]).includes(a.platform)?'':'none'}" value="${a.platform&&!(DB.platforms||[]).includes(a.platform)?esc(a.platform):''}"></div></div>
    </div>
    <!-- Property fields -->
    <div id="assetPropFlds" style="display:${a.kind==='property'?'block':'none'}">
      <div class="fldrow mt"><div><label class="fld">Property type</label><select id="f_inv" class="input" onchange="assetInvestmentChange(this.value)">
        <option value="1" ${a.investment!==false?'selected':''}>Investment property (rental / gearing)</option>
        <option value="0" ${a.investment===false?'selected':''}>Primary residence / PPOR</option></select></div></div>
      <div class="fldrow mt"><div style="flex:2"><label class="fld">Address (optional)</label><input id="f_ad" class="input" value="${esc(a.address||'')}"></div></div>
      <div class="fldrow mt"><div style="flex:2"><label class="fld">Listing / estimate URL</label><input id="f_u" class="input" value="${esc(a.url||'')}" placeholder="e.g. realestate.com.au / property.com.au link"></div></div>
      <div class="fldrow mt"><div><label class="fld">Purchase date</label><input id="f_d" type="date" class="input" value="${a.purchaseDate||''}"></div>
      <div><label class="fld">Purchase price ($)</label><input id="f_p" class="input money" value="${a.purchasePrice||''}"></div></div>
      ${id?'':`<label class="mt" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="f_mk" checked> Also create linked <b>valuation</b> &amp; <b>loan</b> items in Net Worth</label>`}
      <div class="note" id="assetInvHint" style="margin-top:8px">${a.investment===false?'A home you live in: no rental income, management fees, gearing, or property deductions — but you can still log expenses for budgeting.':'Tracks rental income, management fees, depreciation, borrowing costs, and gearing — all of which feed into your tax deductions.'}</div>
    </div>
    <!-- Vehicle fields -->
    <div id="assetVehicleFlds" style="display:${a.kind==='vehicle'?'block':'none'}">
      <div class="fldrow mt"><div><label class="fld">Purchase date</label><input id="f_vd" type="date" class="input" value="${a.purchaseDate||''}"></div>
      <div><label class="fld">Purchase price ($)</label><input id="f_vp" class="input money" value="${a.purchasePrice||''}"></div></div>
      <div class="fldrow mt"><div><label class="fld">Depreciation rate (% / year)</label><input id="f_vr" class="input money" value="${a.depreciationRate??15}"></div></div>
      <div class="hint">Used to estimate the vehicle's current value (diminishing-value method: value × (1 − rate)^years). It's a rough guide — adjust to match your make/model, or check carsales.com.au / Redbook for a real-world estimate and log it as a Net worth entry instead.</div>
      ${id?'':`<label class="mt" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="f_vmk" checked> Also create a linked <b>valuation</b> item in Net Worth</label>`}
    </div>
    <!-- Frequent Flyer fields -->
    <div id="assetFFflds" style="display:${a.kind==='ff_points'?'block':'none'}">
      <div class="fldrow mt"><div><label class="fld">Program / airline</label><input id="f_ffprog" class="input" value="${esc(a.ffProgram||'')}" placeholder="e.g. Qantas Frequent Flyer"></div>
      <div><label class="fld">Points value (¢ each)</label><input id="f_ffval" class="input money" value="${a.ffPointValue??1}" placeholder="e.g. 1"></div></div>
      <div class="hint">Value per point in Australian cents — used to estimate the balance's approximate dollar value. Qantas points are typically valued between 0.5¢ and 2¢ depending on how they're redeemed.</div>
    </div>
    <!-- Other asset: acquired date -->
    <div id="assetOtherFlds" style="display:${a.kind==='other'?'block':'none'}">
      <div class="fldrow mt"><div><label class="fld">Date acquired</label><input id="f_acq" type="date" class="input" value="${a.acquiredDate||''}"></div></div>
      <div class="hint">Used to filter this asset out of FY views that pre-date its acquisition — e.g. looking at FY2023 won't show an asset you got in 2026.</div>
    </div>
    ${isShare?`<div class="hint mt">Acquisition date for shares comes from your first buy transaction — set that when you log a transaction via the asset card.</div>`:''}`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="assetSave('${id||''}')">Save</button>`);
}
function assetInvestmentChange(v){
  const el=$('#assetInvHint');if(!el)return;
  el.innerHTML=v==='0'?'A home you live in: no rental income, management fees, gearing, or property deductions — but you can still log expenses for budgeting.':'Tracks rental income, management fees, depreciation, borrowing costs, and gearing — all of which feed into your tax deductions.';
}
function assetKindChange(v){
  const isShare=v==='shares'||v==='managed_fund';
  $('#assetShareFlds').style.display=isShare?'block':'none';
  $('#assetPropFlds').style.display=v==='property'?'block':'none';
  $('#assetVehicleFlds').style.display=v==='vehicle'?'block':'none';
  $('#assetFFflds').style.display=v==='ff_points'?'block':'none';
  $('#assetOtherFlds').style.display=v==='other'?'block':'none';
}
function assetSave(id){
  const kind=$('#f_k').value;
  const isShare=kind==='shares'||kind==='managed_fund';
  const vals={name:$('#f_n').value.trim()||'Asset',kind,
    code:isShare?($('#f_code')?$('#f_code').value.trim().toUpperCase():''):'',
    address:kind==='property'&&$('#f_ad')?$('#f_ad').value.trim():'',
    url:kind==='property'&&$('#f_u')?$('#f_u').value.trim():'',
    investment:kind==='property'&&$('#f_inv')?$('#f_inv').value!=='0':true,
    purchaseDate:kind==='property'&&$('#f_d')?$('#f_d').value:(kind==='vehicle'&&$('#f_vd')?$('#f_vd').value:''),
    purchasePrice:kind==='property'&&$('#f_p')?num($('#f_p').value)||'':(kind==='vehicle'&&$('#f_vp')?num($('#f_vp').value)||'':''),
    depreciationRate:kind==='vehicle'&&$('#f_vr')?num($('#f_vr').value)||15:'',
    ffProgram:kind==='ff_points'&&$('#f_ffprog')?$('#f_ffprog').value.trim():'',
    ffPointValue:kind==='ff_points'&&$('#f_ffval')?num($('#f_ffval').value)||1:'',
    acquiredDate:kind==='other'&&$('#f_acq')?$('#f_acq').value||'':'',
    platform:isShare&&$('#f_plat')?(($('#f_plat').value==='__custom__'?$('#f_plat_custom')?.value:$('#f_plat').value)||'').trim():''};
  if(vals.platform&&!(DB.platforms||[]).includes(vals.platform))DB.platforms.push(vals.platform);
  if(id){const a=DB.assets.find(x=>x.id===id);Object.assign(a,vals);}
  else{
    const pid=isAll()?DB.people[0].id:DB.currentPid;
    const a={id:uid(),pid,costs:[],transactions:[],...vals};
    if(kind==='vehicle')a.odometer=[];
    DB.assets.push(a);
    if(kind==='property'&&$('#f_mk')&&$('#f_mk').checked){
      DB.nw.items.push({id:uid(),pid,name:vals.name+' — valuation',kind:'asset',assetId:a.id});
      DB.nw.items.push({id:uid(),pid,name:vals.name+' — loan',kind:'liability',assetId:a.id});
      if(vals.purchasePrice&&vals.purchaseDate){
        const it=DB.nw.items[DB.nw.items.length-2];
        DB.nw.entries.push({id:uid(),itemId:it.id,date:vals.purchaseDate,value:num(vals.purchasePrice)});
      }
    }
    if(kind==='vehicle'&&$('#f_vmk')&&$('#f_vmk').checked){
      DB.nw.items.push({id:uid(),pid,name:vals.name+' — valuation',kind:'asset',assetId:a.id});
      if(vals.purchasePrice&&vals.purchaseDate){
        const it=DB.nw.items[DB.nw.items.length-1];
        DB.nw.entries.push({id:uid(),itemId:it.id,date:vals.purchaseDate,value:num(vals.purchasePrice)});
      }
    }
  }
  save();closeModal();render();toast('Asset saved');
}
/* ---- Vehicle: depreciation estimate + odometer tracking ---- */
function vehicleEstimatedValue(a){
  if(!a.purchasePrice||!a.purchaseDate)return null;
  const years=(Date.now()-new Date(a.purchaseDate+'T00:00:00Z').getTime())/(365.25*86400*1000);
  const rate=(num(a.depreciationRate)||15)/100;
  return Math.max(0,num(a.purchasePrice)*Math.pow(1-rate,Math.max(0,years)));
}
function vehicleKmPerYear(a){
  const odo=(a.odometer||[]).slice().sort((x,y)=>x.date<y.date?-1:1);
  if(odo.length<2)return null;
  const first=odo[0],last=odo[odo.length-1];
  const years=(new Date(last.date+'T00:00:00Z')-new Date(first.date+'T00:00:00Z'))/(365.25*86400*1000);
  if(years<=0||num(last.km)<=num(first.km))return null;
  return (num(last.km)-num(first.km))/years;
}
function vehicleOdoAdd(assetId,i){
  if(lockedGuard())return;
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;a.odometer=a.odometer||[];
  const r=i!=null?a.odometer[i]:{date:todayISO(),km:''};
  modal(i!=null?'Edit odometer reading':'Add odometer reading',`
    <div class="fldrow"><div><label class="fld">Date</label><input id="f_d" type="date" class="input" value="${r.date}"></div>
    <div><label class="fld">Odometer (km)</label><input id="f_km" class="input money" value="${r.km}"></div></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="vehicleOdoSave('${assetId}',${i==null?'null':i})">Save</button>`);
}
function vehicleOdoSave(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;a.odometer=a.odometer||[];
  const r={id:i!=null?a.odometer[i].id:uid(),date:$('#f_d').value||todayISO(),km:num($('#f_km').value)};
  if(i!=null)a.odometer[i]=r;else a.odometer.push(r);
  save();closeModal();render();toast('Odometer reading saved');
}
function vehicleOdoDelete(assetId,i){
  if(lockedGuard())return;
  const a=DB.assets.find(x=>x.id===assetId);if(!a)return;a.odometer.splice(i,1);save();render();
}
/* Total borrowing-cost-schedule claim for an asset in a given FY — summed
   across all of its costs. Computed on the fly (like depreciation and
   management fee) rather than written as literal property-expense rows,
   since this is a tax deduction with no cash outlay in the years after
   the cost was first incurred — it should never appear as a "expense"
   on the Expenses page or in cashflow calculations. */
function costScheduleForFY(asset,y){
  // Borrowing-expense deductions (5-year ATO spread) only apply to investment
  // property loans — not shares, managed funds, vehicles, or other assets.
  // Guard against miscategorised cost entries inflating deductions elsewhere.
  if(asset.kind!=='property'||asset.investment===false)return 0;
  return (asset.costs||[]).reduce((s,c)=>{
    const row=assetCostSchedule(asset,c).find(r=>r.fy===fyOrderYear(y));
    return s+(row?row.amount:0);
  },0);
}
function assetCostAdd(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const c=i!=null?a.costs[i]:{name:'',date:a.purchaseDate||todayISO(),amount:'',spreadYears:5};
  modal(i!=null?'Edit cost':'Add purchase / borrowing cost',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Cost</label><input id="f_n" class="input" value="${esc(c.name)}" placeholder="e.g. Loan establishment fee, LMI"></div>
    <div><label class="fld">Date incurred</label><input id="f_d" type="date" class="input" value="${c.date}"></div></div>
    <div class="fldrow mt"><div><label class="fld">Amount ($)</label><input id="f_a" class="input money" value="${c.amount}"></div>
    <div><label class="fld">Spread over (years)</label><select id="f_y" class="input">
      <option value="1" ${num(c.spreadYears)===1?'selected':''}>1 — claim in full that year</option>
      <option value="5" ${num(c.spreadYears)===5||!c.spreadYears?'selected':''}>5 — ATO borrowing-expense rule</option>
      <option value="2" ${num(c.spreadYears)===2?'selected':''}>2</option><option value="3" ${num(c.spreadYears)===3?'selected':''}>3</option><option value="4" ${num(c.spreadYears)===4?'selected':''}>4</option></select></div></div>
    <div class="note">Borrowing expenses over $100 are deductible over 5 years or the loan term if shorter, apportioned by days in the first year. This is a deduction only — not a cash expense — so it's included automatically in each year's tax figures without appearing in Expenses or cashflow.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="assetCostSave('${assetId}',${i==null?'null':i})">Save</button>`);
}
function assetCostSave(assetId,i){
  const a=DB.assets.find(x=>x.id===assetId);
  if(!a)return;
  const c={id:i!=null?a.costs[i].id:uid(),name:$('#f_n').value.trim()||'Cost',date:$('#f_d').value,amount:num($('#f_a').value),spreadYears:num($('#f_y').value)||1};
  if(i!=null)a.costs[i]=c;else a.costs.push(c);
  save();closeModal();render();toast('Cost saved — schedule applied to each financial year');
}

/* ================= TAX SETTINGS ================= */
PAGES.settings=m=>{
  const y=FY(),R=y.rates;
  head(m,'Tax settings',`These rates belong to <b>${esc(y.label)} only</b>. Each financial year keeps its own frozen snapshot — changing next year's rates never rewrites this year's reports.`,
    `<button class="btn" onclick="settingsAddEarlierFY()">+ Add earlier FY</button>
     <button class="btn" onclick="settingsClone()">Clone → new FY</button>
     <button class="btn ${y.locked?'':'primary'}" onclick="settingsLock()">${y.locked?'Unlock '+esc(y.label):'Lock '+esc(y.label)}</button>`);
  const dis=y.locked?'disabled':'';
  const bRows=R.brackets.map((b,i)=>`<tr>
    <td class="num"><input class="input money" ${dis} value="${b.upTo??''}" placeholder="∞ (top bracket)" onchange="FY().rates.brackets[${i}].upTo=this.value===''?null:num(this.value);save();render()"></td>
    <td class="num"><input class="input money" ${dis} value="${b.rate}" onchange="FY().rates.brackets[${i}].rate=num(this.value);save();render()"></td>
    <td class="rowact"><button class="btn ghost small" ${dis} onclick="FY().rates.brackets.splice(${i},1);save();render()">✕</button></td></tr>`).join('');
  const mlsRows=R.mls.map((t,i)=>`<tr>
    <td class="num"><input class="input money" ${dis} value="${t.min}" onchange="FY().rates.mls[${i}].min=num(this.value);save();render()"></td>
    <td class="num"><input class="input money" ${dis} value="${t.rate}" onchange="FY().rates.mls[${i}].rate=num(this.value);save();render()"></td>
    <td class="rowact"><button class="btn ghost small" ${dis} onclick="FY().rates.mls.splice(${i},1);save();render()">✕</button></td></tr>`).join('');
  const hols=fyHolidays(y).map(h=>`<div class="kv"><span class="k">${fmtDate(h.date)} — ${esc(h.name)}</span>
    <button class="btn ghost small" ${dis} onclick="settingsRemoveHol('${h.date}')">remove</button></div>`).join('');
  m.insertAdjacentHTML('beforeend',`
  ${y.locked?'<div class="note" style="border-color:var(--gold);margin-bottom:16px">🔒 <b>'+esc(y.label)+' is locked.</b> Its rates and records are frozen for historical accuracy. Unlock above only if you genuinely need to correct something.</div>':''}
  <div class="grid2">
    <div>
      <div class="card"><div class="chead"><h2>Income tax brackets</h2><button class="btn small" ${dis} onclick="FY().rates.brackets.push({upTo:null,rate:0});save();render()">+ Bracket</button></div>
      <div class="cbody tight"><table class="tbl"><thead><tr><th class="num">Up to ($)</th><th class="num">Rate %</th><th></th></tr></thead><tbody>${bRows}</tbody></table></div></div>

      <div class="card"><div class="chead"><h2>Low income tax offset</h2></div><div class="cbody"><div class="fldrow">
        <div><label class="fld">Max offset $</label><input class="input money" ${dis} value="${R.lito.max}" onchange="FY().rates.lito.max=num(this.value);save()"></div>
        <div><label class="fld">Full until $</label><input class="input money" ${dis} value="${R.lito.t1}" onchange="FY().rates.lito.t1=num(this.value);save()"></div>
        <div><label class="fld">Taper 1 %</label><input class="input money" ${dis} value="${R.lito.taper1}" onchange="FY().rates.lito.taper1=num(this.value);save()"></div>
        <div><label class="fld">Until $</label><input class="input money" ${dis} value="${R.lito.t2}" onchange="FY().rates.lito.t2=num(this.value);save()"></div>
        <div><label class="fld">Taper 2 %</label><input class="input money" ${dis} value="${R.lito.taper2}" onchange="FY().rates.lito.taper2=num(this.value);save()"></div>
      </div></div></div>

      <div class="card"><div class="chead"><h2>Medicare levy</h2></div><div class="cbody"><div class="fldrow">
        <div><label class="fld">Rate %</label><input class="input money" ${dis} value="${R.medicare.rate}" onchange="FY().rates.medicare.rate=num(this.value);save()"></div>
        <div><label class="fld">Low-income threshold $</label><input class="input money" ${dis} value="${R.medicare.lowerThreshold}" onchange="FY().rates.medicare.lowerThreshold=num(this.value);save()"></div>
        <div><label class="fld">Shade-in rate %</label><input class="input money" ${dis} value="${R.medicare.shadeRate}" onchange="FY().rates.medicare.shadeRate=num(this.value);save()"></div>
      </div></div></div>

      <div class="card"><div class="chead"><h2>Medicare levy surcharge (singles)</h2><button class="btn small" ${dis} onclick="FY().rates.mls.push({min:0,rate:0});save();render()">+ Tier</button></div>
      <div class="cbody tight"><table class="tbl"><thead><tr><th class="num">Income from ($)</th><th class="num">Rate %</th><th></th></tr></thead><tbody>${mlsRows}</tbody></table></div></div>
    </div>
    <div>
      <div class="card"><div class="chead"><h2>WFH & travel rates</h2></div><div class="cbody"><div class="fldrow">
        <div><label class="fld">WFH rate $ / hour</label><input class="input money" ${dis} value="${R.wfh.ratePerHour}" onchange="FY().rates.wfh.ratePerHour=num(this.value);save()"></div>
        <div><label class="fld">Default hours / day</label><input class="input money" ${dis} value="${R.wfh.hoursPerDay}" onchange="FY().rates.wfh.hoursPerDay=num(this.value);save()"></div>
        <div><label class="fld">Immediate device cap $</label><input class="input money" ${dis} value="${R.deviceImmediateCap}" onchange="FY().rates.deviceImmediateCap=num(this.value);save()"></div>
        <div><label class="fld">Cents per km rate</label><input class="input money" ${dis} value="${R.centsPerKm}" onchange="FY().rates.centsPerKm=num(this.value);save()"></div>
      </div>
      <div class="hint mt">Cents per km is the ATO's published car expense rate for work-related travel — ${R.centsPerKm} for ${esc(fyDisplay(y))}. Used automatically in Deductions → Car travel (cents per km).</div></div></div>

      <div class="card"><div class="chead"><h2>Superannuation caps — ${esc(fyDisplay(y))}</h2></div><div class="cbody"><div class="fldrow">
        <div><label class="fld">Concessional cap $ / yr</label><input class="input money" ${dis} value="${R.superCapConcessional}" onchange="FY().rates.superCapConcessional=num(this.value);save()"></div>
        <div><label class="fld">Non-concessional cap $ / yr</label><input class="input money" ${dis} value="${R.superCapNonConcessional}" onchange="FY().rates.superCapNonConcessional=num(this.value);save()"></div>
        <div><label class="fld">SG rate (% of OTE)</label><input class="input money" ${dis} value="${R.superSGRate}" onchange="FY().rates.superSGRate=num(this.value);save()"></div>
      </div>
      <div class="hint mt">SG rate is the ATO-mandated employer contribution: ${R.superSGRate}% for ${esc(fyDisplay(y))}. Tick "Attracts super" on income rows to auto-calculate the SG contribution. Verify all rates with the ATO before lodging.</div></div></div>

      <div class="card"><div class="chead"><h2>Public holidays — ${esc(fyDisplay(y))}</h2><span>
        <button class="btn small" ${dis||HOLIDAY_REFRESHING?'disabled':''} onclick="refreshHolidays(FY())" title="Fetch from data.vic.gov.au (falls back to date.nager.at)">${HOLIDAY_REFRESHING?'<span class="spinner"></span> Checking…':'↻ Check online'}</button>
        <button class="btn small" ${dis} onclick="settingsAddHol()">+ Add date</button></span></div>
      <div class="cbody">
        <div class="hint" style="margin-bottom:8px">${y.webHolidays?`Last checked online ${fmtDate(y.webHolidays.fetchedAt)}. Sources used: <b>${esc(y.webHolidays.source)}</b>. Checked again automatically about monthly while the year is unlocked.`:'Using the built-in Victorian calendar (AFL Grand Final eve estimated for future years). Press <b>↻ Check online</b> to fetch the official dates.'}</div>
        ${HOLIDAY_REFRESHING?`<div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">${[1,2,3,4,5].map(()=>'<div class="skel-row"></div>').join('')}</div>`:(hols||'<span class="muted">None</span>')}
        ${y.webHolidays?`<div class="kv mt"><span class="k muted">Stop using online dates and go back to the built-in calendar</span><button class="btn ghost small" ${dis} onclick="FY().webHolidays=null;save();render()">reset</button></div>`:''}
        <div class="hint">Sources checked and merged — <b>data.vic.gov.au</b> (filtered to PUBLIC_HOLIDAY only), <b>date.nager.at</b>, and the built-in calendar — so a date missing from one source doesn't create a gap. The "Sources used" line above shows which ones actually contributed dates for ${esc(fyDisplay(y))}.</div>
      </div></div>

      <div class="card"><div class="chead"><h2>People</h2><button class="btn small" onclick="settingsAddPerson()">+ Add person</button></div>
      <div class="cbody">
        ${DB.people.map((p,i)=>`<div class="kv"><span class="k">${pdot(p)} ${esc(p.name)}</span>
          <span><input type="color" value="${p.color||'#888888'}" title="Accent colour when viewing as ${esc(p.name)}" style="width:28px;height:28px;border:none;border-radius:6px;vertical-align:middle;margin-right:6px;cursor:pointer" onchange="settingsPersonColor('${p.id}',this.value)">
          <button class="btn ghost small" onclick="settingsRenamePerson('${p.id}')">rename</button>
          ${DB.people.length>1?`<button class="btn ghost small" onclick="settingsDeletePerson('${p.id}')">remove</button>`:''}</span></div>`).join('')}
        <div class="note">Each person keeps their own income, deductions, WFH calendar and holdings in every financial year, because Australian tax is assessed individually. The <b>⌂ Household</b> view in the sidebar combines everyone and stays neutral. Pick a colour above to tint the active page highlight while viewing as that person — handy for telling at a glance whose data you're looking at.</div>
      </div></div>

      <div class="card"><div class="chead"><h2>Platforms</h2><button class="btn small" onclick="settingsAddPlatform()">+ Add platform</button></div>
      <div class="cbody">
        ${(DB.platforms||[]).map((p,i)=>`<div class="kv"><span class="k"><span class="badge" style="background:${platformColor(p)}22;border-color:${platformColor(p)};color:${platformColor(p)}">${esc(p)}</span></span>
          <span><input type="color" value="${platformColor(p)}" title="Colour for ${esc(p)}" style="width:28px;height:28px;border:none;border-radius:6px;vertical-align:middle;margin-right:6px;cursor:pointer" onchange="settingsPlatformColor('${esc(p).replace(/'/g,"\\'")}',this.value)">
          <button class="btn ghost small" onclick="DB.platforms.splice(${i},1);save();render()">remove</button></span></div>`).join('')||'<span class="muted">None yet</span>'}
        <div class="note">These appear as suggestions wherever you pick a platform (dividends, funds). Pick a colour to show as a coloured pill on the Dividends page, so you can tell at a glance which platform each payment came from.</div>
      </div></div>

      <div class="card"><div class="chead"><h2>Receipt storage</h2>
        ${GD.isConnected()?
          `<span class="badge euc">✓ Google Drive connected</span>`:
          GD.cfg.userEmail?
          `<span class="badge gold">Signed in but token expired</span>`:
          `<span class="badge" style="color:var(--muted);border-color:var(--line2)">Local only (IndexedDB)</span>`}
        </div><div class="cbody">
        <div class="grid2" style="gap:12px;margin-bottom:14px">
          <div class="stat"><div class="l">Local (IndexedDB)</div><div class="v" style="font-size:1rem">Always on</div>
            <div class="d">Included in Export backup · tied to this browser</div></div>
          <div class="stat ${GD.isConnected()?'good':''}"><div class="l">Google Drive</div>
            <div class="v" style="font-size:1rem">${GD.isConnected()?'Active':'Not connected'}</div>
            <div class="d">Files in your Drive · NOT in export backup · works across devices</div></div>
        </div>
        <div class="kv">
          <span class="k">Signed in as</span>
          <span class="v">${DB.gdrive?.userEmail?`<b>${esc(DB.gdrive.userEmail)}</b>`:`<span class="muted">Not signed in</span>`}</span></div>
        ${GD.isConnected()?`
        <div class="note mt">
          Receipts are uploaded to Google Drive automatically — no setup needed. Each receipt is filed into a folder structure by financial year and category:
          <pre style="font-size:.8rem;line-height:1.7;background:var(--surface2);border-radius:6px;padding:10px 14px;margin-top:8px;overflow-x:auto">Ledger/
├── FY25–26/
│   ├── Investment Property/
│   │   └── 2025-08-01 Loan interest.pdf
│   ├── Other Deductions/
│   │   └── 2026-03-15 Tax prep fee.pdf
│   └── Expenses/
│       └── 2026-01-01 Mortgage repayment.pdf
└── FY24–25/
    └── …</pre>
          Local copies are deleted once a receipt is uploaded to Drive, so backup files stay small.
        </div>`:`
        <div class="kv mt"><span class="k"></span>
          <button class="btn primary" onclick="gdConnect()">Connect Google Drive</button></div>
        <div class="hint mt">Without Drive, receipts stay in local IndexedDB and are included in Export backups.</div>`}
        ${Object.keys(DB.rcptMeta||{}).length?`
        <div class="kv mt">
          <span class="k">${Object.values(DB.rcptMeta||{}).filter(m=>m.store==='gdrive').length} in Drive · ${Object.values(DB.rcptMeta||{}).filter(m=>m.store!=='gdrive').length} local</span>
          ${GD.isConnected()?`<button class="btn small" onclick="rcptMigrateIDB()">Migrate local receipts → Drive</button>`:''}
        </div>`:''}
      </div></div>

      ${GD.isConnected()?`
      <div class="card"><div class="chead"><h2>Version history</h2><span class="actions"><button class="btn small primary" onclick="createVersionNow()">+ Create new version</button><button class="btn small" onclick="renderVersionHistory()">↻ Refresh</button></span></div><div class="cbody" id="versionHistory">
        <div class="muted">Loading…</div>
      </div></div>`:''}

      <div class="card"><div class="chead"><h2>Financial years</h2></div><div class="cbody">
        ${Object.values(DB.years).sort((a,b)=>fyOrderYear(b)-fyOrderYear(a)).map(fy=>`<div class="kv"><span class="k">${esc(fyDisplay(fy))}${fy.displayName?` <span class="muted" style="font-size:.78rem">(${esc(fy.label)})</span>`:''} ${fy.locked?'🔒':''}</span>
          <span style="display:flex;gap:6px">
            <button class="btn ghost small" onclick="settingsEditFY('${fy.startYear}')">rename</button>
            ${Object.keys(DB.years).length>1?`<button class="btn ghost small" onclick="settingsDeleteFY('${fy.startYear}')">delete</button>`:''}</span></div>`).join('')}
        <div class="note">"Clone → new FY" copies this year's rates as the starting point for the next year. Use <b>rename</b> to give any year a custom display name or adjust its start/end dates.</div>
      </div></div>

      <div class="card" style="border-color:var(--red)"><div class="chead"><h2 style="color:var(--red)">⚠️ Danger zone</h2></div><div class="cbody">
        <div class="kv"><span class="k">Clean slate — wipe data and start fresh</span>
          <button class="btn danger small" onclick="cleanSlateOpen()">Clean slate…</button></div>
        <div class="note">Pick exactly what to wipe — everything you leave unticked is kept as-is. ${GD.isConnected()?'A timestamped safety snapshot of everything as it stands right now is taken first, so you can undo via <b>Version history</b> above if this was a mistake.':'<b>Google Drive isn\u2019t connected, so there\u2019s no safety-net snapshot</b> — deletions here would be permanent. Connect Drive above first if you want an undo option.'}</div>
      </div></div>
    </div>
  </div>`);
  if(GD.isConnected())renderVersionHistory();
};
function settingsEditFY(k){
  const y=DB.years[k];
  // Auto-label is ALWAYS derived from dates — never from displayName
  const autoLabel=fyLabelFromStart(y.rangeStart||y.startYear+'-07-01');
  modal('Edit financial year',`
    <div class="fldrow">
      <div style="flex:2"><label class="fld">Display name <span class="muted">(optional override)</span></label>
        <input id="f_dn" class="input" value="${esc(y.displayName||'')}" placeholder="Leave blank to use the auto-generated label" oninput="fyDatePreview()">
        <div class="hint mt" id="fyLabelHint">Auto-label from dates: <b>${esc(autoLabel)}</b>${y.displayName?` · shown as: <b>${esc(y.displayName)}</b>`:''}</div></div>
    </div>
    <div class="fldrow mt">
      <div><label class="fld">Start date</label><input id="f_s" type="date" class="input" value="${y.rangeStart||y.startYear+'-07-01'}" oninput="fyDatePreview()"></div>
      <div><label class="fld">End date</label><input id="f_e" type="date" class="input" value="${y.rangeEnd||(y.startYear+1)+'-06-30'}"></div>
    </div>
    <div class="note">The <b>auto-label</b> (e.g. FY24–25) is always derived from the start date. The display name is an optional override shown everywhere instead — leave it blank to use the auto-label.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="settingsEditFYSave('${k}')">Save</button>`);
}
function fyDatePreview(){
  const s=$('#f_s');const dn=$('#f_dn');const hint=$('#fyLabelHint');
  if(!hint)return;
  const derived=fyLabelFromStart(s?s.value:'');
  const customName=dn?dn.value.trim():'';
  // Always show the auto-label; show display name as a separate "shown as" note
  hint.innerHTML=`Auto-label from dates: <b>${derived||'—'}</b>`
    +(customName?` · shown as: <b>${esc(customName)}</b>`
      :`<span class="muted"> (will be used as-is — no display name set)</span>`);
}
function settingsEditFYSave(k){
  const y=DB.years[k];
  const dn=$('#f_dn');y.displayName=dn?dn.value.trim():'';
  const s=$('#f_s'),e=$('#f_e');
  const sv=s?s.value:'', ev=e?e.value:'';
  y.rangeStart=(sv&&sv!==y.startYear+'-07-01')?sv:null;
  y.rangeEnd=(ev&&ev!==(y.startYear+1)+'-06-30')?ev:null;
  y.label=fyLabelFromStart(y.rangeStart||y.startYear+'-07-01');
  save();closeModal();initFYSelect();render();toast('Financial year updated');
}
function settingsLock(){
  const y=FY();
  if(y.locked){
    modal('Unlock '+esc(y.label),`
      <p>Frozen years should stay frozen — that's what keeps your historical reports accurate. Only unlock to fix a genuine mistake, and lock it again afterwards.</p>`,
      `<button class="btn" data-close>Keep it locked</button><button class="btn danger" onclick="FY().locked=false;save();closeModal();render();toast('${esc(y.label)} unlocked — remember to re-lock it')">Unlock anyway</button>`);
  }
  else{y.locked=true;save();render();toast(y.label+' locked — snapshot frozen');}
}
function settingsAddPerson(){
  modal('Add person',`
    <div class="fldrow"><div style="flex:2"><label class="fld">Name</label><input id="f_n" class="input" placeholder="e.g. Alex"></div></div>
    <div class="note">They'll get their own records in every financial year. Existing data stays with its current owner.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="(function(){
      const name=$('#f_n').value.trim()||'Partner';
      const p={id:uid(),name,color:PERSON_COLS[DB.people.length%PERSON_COLS.length]};
      DB.people.push(p);
      Object.values(DB.years).forEach(y=>bucket(y,p.id));
      save();closeModal();render();toast(name+' added — switch people in the sidebar');})()">Add</button>`);
}
function settingsPersonColor(pid,color){
  const p=person(pid);
  p.color=color;
  save();applyPersonAccent();render();
}
function settingsRenamePerson(pid){
  const p=person(pid);
  modal('Rename person',`
    <label class="fld">Name</label><input id="f_n" class="input" value="${esc(p.name)}">`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="(function(){
      const v=$('#f_n').value.trim();
      if(v){person('${pid}').name=v;save();}
      closeModal();render();})()">Save</button>`);
}
function settingsDeletePerson(pid){
  const p=person(pid);
  modal('Remove '+esc(p.name),`
    <p>This permanently removes <b>${esc(p.name)}</b> and ALL their records in every financial year — income, expenses, dividends, managed funds, share sales, WFH calendars, deductions, assets (and any dividends/distributions linked to them), and net worth items.</p>
    <div class="note">${GD.isConnected()?'A safety snapshot of everything as it stands right now will be saved first, so you can undo this via <b>Settings → Version history</b> if it was a mistake.':'<b>Google Drive isn\u2019t connected, so there\u2019s no safety-net snapshot</b> — consider pressing Export in the sidebar first.'}</div>
    <label class="mt" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="f_sure"> I understand this removes ${esc(p.name)}'s data</label>`,
    `<button class="btn" data-close>Cancel</button><button class="btn danger" onclick="settingsDeletePersonGo('${pid}')">Remove permanently</button>`);
}
async function settingsDeletePersonGo(pid){
  if(!$('#f_sure').checked)return toast('Tick the confirmation box first');
  const p=person(pid);
  let snapOk=false;
  if(GD.isConnected()){toast('Saving safety snapshot…');snapOk=await snapshotNow('predelete');}
  // Clean up this person's receipts (Drive + local) across every FY first
  const ids=collectReceiptIds({pid});
  if(ids.length)toast(`Removing ${p.name} — cleaning up ${ids.length} receipt(s)…`);
  await deleteReceiptIds(ids);
  // Remove this person's assets — cascades to delete any dividends/funds/
  // fundPayments/net worth items linked to them (assetDeleteCascade), so
  // nothing is left orphaned referencing a person that no longer exists.
  [...DB.assets].filter(a=>(a.pid||DB.people[0].id)===pid).forEach(a=>assetDeleteCascade(a.id));
  DB.people=DB.people.filter(x=>x.id!==pid);
  Object.values(DB.years).forEach(y=>{delete (y.people||{})[pid];(y.budgets||[]).forEach(b=>{
    if(b.scope===pid)b._dead=true;
    b.incomes=b.incomes.filter(r=>r.pid!==pid);b.deds=b.deds.filter(r=>r.pid!==pid);delete b.opts[pid];
  });y.budgets=(y.budgets||[]).filter(b=>!b._dead);});
  DB.nw.items.filter(it=>it.pid===pid).forEach(it=>{DB.nw.entries=DB.nw.entries.filter(e=>e.itemId!==it.id);});
  DB.nw.items=DB.nw.items.filter(it=>it.pid!==pid);
  if(DB.currentPid===pid)DB.currentPid=DB.people[0].id;
  pruneOrphanRcptMeta();
  save();closeModal();render();
  toast(`${p.name} removed${snapOk?' — a snapshot was saved first':''}`);
}
function settingsAddPlatform(){
  modal('Add platform',`
    <label class="fld">Platform name</label><input id="f_n" class="input" placeholder="e.g. Vanguard Personal Investor">`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="(function(){
      const v=$('#f_n').value.trim();
      if(v&&!DB.platforms.includes(v)){DB.platforms.push(v);save();}
      closeModal();render();})()">Add</button>`);
}
function settingsClone(){
  const ys=Object.keys(DB.years).map(Number);
  const next=Math.max(...ys)+1;
  const cur=FY();
  const fresh=newFY(next,JSON.parse(JSON.stringify(cur.rates)));
  // carry saved budgets forward as starting points (new ids, history untouched)
  fresh.budgets=(cur.budgets||[]).map(b=>{const c=JSON.parse(JSON.stringify(b));c.id=uid();c.createdAt=todayISO();return c;});
  DB.years[String(next)]=fresh;
  // Carry forward recurring rows (recurrence !== 'once') so things like
  // salary, rent, and loan repayments don't need re-entering each year —
  // one-off rows are left behind on purpose. Amounts/rates carry over as a
  // starting point; edit them for the new year as needed.
  let carried=0;
  DB.people.forEach(p=>{
    const oldB=bucket(cur,p.id),newB=bucket(fresh,p.id);
    (oldB.incomes||[]).filter(r=>(r.recurrence||'monthly')!=='once').forEach(r=>{newB.incomes.push({...r,id:uid()});carried++;});
    (oldB.preTaxDeds||[]).filter(r=>(r.recurrence||'monthly')!=='once').forEach(r=>{newB.preTaxDeds.push({...r,id:uid()});carried++;});
    (oldB.expenses||[]).filter(r=>(r.recurrence||'monthly')!=='once').forEach(r=>{
      const ne={...r,id:uid()};delete ne.receiptId;
      newB.expenses.push(ne);carried++;
      if(ne.isDeductible&&ne.assetId&&expDeductibleAmt(ne))expSyncPropExpense(ne,newB);
    });
    // Property expenses entered directly (not linked to an "expenses" row)
    // recur structurally too (same category/item/asset), but amounts
    // genuinely change year to year — carry the shape across with amounts
    // reset to 0 so there's nothing to re-create, just figures to fill in.
    (oldB.property?.expenses||[]).filter(e=>!e.expenseId).forEach(e=>{
      newB.property.expenses.push({id:uid(),date:'',category:e.category,item:e.item,amount:0,deductibleAmount:0,assetId:e.assetId||''});
    });
  });
  if(!cur.locked&&fyIsPast(cur)&&confirm(`${cur.label} has ended. Lock it now to freeze its rates?`))cur.locked=true;
  DB.currentFY=String(next);
  save();initFYSelect();render();
  toast(fresh.label+' created from '+cur.label+"'s rates"+(carried?` — ${carried} recurring row${carried===1?'':'s'} carried forward`:''));
}
function settingsAddEarlierFY(){
  const ys=Object.keys(DB.years).map(Number);
  const earliest=Math.min(...ys);
  modal('Add an earlier financial year',`
    <div class="hint">For claims that fall in a year before any you've created yet — e.g. an immediate write-off device, or the first partial year of a depreciation schedule.</div>
    <div class="fldrow mt"><div><label class="fld">Financial year starting</label><input id="f_efy" class="input money" value="${earliest-1}" placeholder="e.g. ${earliest-1} for FY${String(earliest-1).slice(2)}–${String(earliest).slice(2)}"></div></div>
    <div class="hint" id="earlierFYPreview" style="margin-top:4px"></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="settingsAddEarlierFYSave()">Create</button>`);
  setTimeout(()=>{
    const upd=()=>{
      const el=$('#earlierFYPreview');if(!el)return;
      const yr=num($('#f_efy').value);
      if(!yr){el.textContent='';return;}
      el.innerHTML=DB.years[String(yr)]?`<span class="bad">${esc(fyDisplay(DB.years[String(yr)]))} already exists.</span>`:`= 1 Jul ${yr} – 30 Jun ${yr+1}`;
    };
    $('#f_efy').addEventListener('input',upd);upd();
  },30);
}
function settingsAddEarlierFYSave(){
  const yr=num($('#f_efy').value);
  if(!yr)return toast('Enter a year');
  if(DB.years[String(yr)])return toast('That financial year already exists');
  const ys=Object.keys(DB.years).map(Number);
  const closest=DB.years[String(Math.min(...ys))]; // base rates off the earliest existing year, since it's chronologically closest
  const fresh=newFY(yr,JSON.parse(JSON.stringify(closest.rates)));
  DB.years[String(yr)]=fresh;
  save();closeModal();initFYSelect();render();
  toast(fyDisplay(fresh)+' created — its rates default from '+fyDisplay(closest)+", double check them since older years' brackets and rates may differ.");
}
async function settingsDeleteFY(k){
  const fy=DB.years[k];
  if(!confirm(`Delete ${fyDisplay(fy)} and ALL its records? This cannot be undone.`))return;
  if(!confirm('Really sure? Consider exporting a backup first.'))return;
  // Clean up receipts (Drive + local) tied to this FY before discarding the records
  const ids=collectReceiptIds({fyKey:k});
  toast('Deleting '+fyDisplay(fy)+'…');
  await deleteDriveFolderByPath('Applications/Ledger/'+fyDisplay(fy));
  await deleteReceiptIds(ids);
  delete DB.years[k];
  if(DB.currentFY===k)DB.currentFY=Object.keys(DB.years)[0];
  pruneOrphanRcptMeta();
  save();initFYSelect();render();
  toast(fyDisplay(fy)+' deleted'+(ids.length?` (${ids.length} receipt${ids.length===1?'':'s'} removed)`:''));
}
function settingsAddHol(){
  modal('Add public holiday',`
    <div class="fldrow"><div><label class="fld">Date</label><input id="f_d" type="date" class="input"></div>
    <div style="flex:2"><label class="fld">Name</label><input id="f_n" class="input" placeholder="e.g. AFL Grand Final eve (confirmed)"></div></div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" onclick="(function(){const y=FY();y.extraHolidays.push({date:$('#f_d').value,name:$('#f_n').value||'Public holiday'});save();closeModal();render();})()">Add</button>`);
}
function settingsRemoveHol(date){
  const y=FY();
  y.extraHolidays=(y.extraHolidays||[]).filter(h=>h.date!==date);
  if(!y.removedHolidays.includes(date))y.removedHolidays.push(date);
  save();render();
}

/* ================= EXPORT / IMPORT ================= */
async function exportAll(){
  const receipts=[];
  const driveCount=Object.values(DB.rcptMeta||{}).filter(m=>m.store==='gdrive').length;
  try{
    const d=await idb();
    const all=await new Promise((res,rej)=>{const r=d.transaction('receipts').objectStore('receipts').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
    for(const rec of all){
      const b64=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(rec.blob);});
      receipts.push({id:rec.id,name:rec.name,type:rec.type,data:b64});
    }
  }catch(e){}
  // Drive-backed receipts are NOT included in the backup file (they live in your Drive).
  // Their metadata is part of DB.rcptMeta and will be restored with the DB.
  const exportObj={db:DB,receipts};
  const blob=new Blob([JSON.stringify(exportObj,null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ledger-backup-${todayISO()}.json`;a.click();
  toast(driveCount?`Backup downloaded — note: ${driveCount} Drive receipt(s) are not in this file (they stay in your Google Drive).`:'Backup downloaded');
}
async function importAll(file){
  try{
    const j=JSON.parse(await file.text());
    if(!j.db||!j.db.years)throw 0;
    if(!confirm('Importing replaces ALL current data with the backup. Continue?'))return;
    DB=ensureDbShape(j.db);save();
    for(const r of j.receipts||[]){
      const blob=await(await fetch(r.data)).blob();
      await rcptPut({id:r.id,name:r.name,type:r.type,blob});
    }
    initFYSelect();render();toast('Backup restored');
  }catch(e){toast('That file doesn\'t look like a Ledger backup');}
}

/* ================= INIT ================= */
/* ============ LAUNCHER SETUP MODAL ============ */
function showLauncherModal(){
  const port=8765;
  // Windows .bat content
  const bat=`@echo off\ncd /d "%~dp0"\necho Starting Ledger...\nset PORT=`+port+`\nnetstat -an | find ":`+port+`" | find "LISTEN" >nul 2>&1\nif not errorlevel 1 (\n  echo Server already running on port `+port+`\n) else (\n  start /min cmd /c "where python3 >nul 2>&1 && python3 -m http.server `+port+` || python -m http.server `+port+`"\n  timeout /t 2 /nobreak >nul\n)\nstart http://localhost:`+port+`/index.html\nexit`;
  // Mac/Linux .command content
  const sh=`#!/bin/bash\ncd "$(dirname "$0")"\nPORT=`+port+`\necho "Starting Ledger..."\nif lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then\n  echo "Server already running on port $PORT"\nelse\n  python3 -m http.server $PORT &\n  sleep 1\nfi\nopen "http://localhost:$PORT/index.html" 2>/dev/null || xdg-open "http://localhost:$PORT/index.html" 2>/dev/null\nwait`;
  function dl(content,filename,mime){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([content],{type:mime}));
    a.download=filename;a.click();
  }
  modal('Set up Ledger launcher',`
    <p style="margin-bottom:14px;line-height:1.6">Google OAuth requires an <b>http://</b> URL — not <code>file://</code>. This is a Google security policy that can't be bypassed. The fix is a tiny launcher script that starts a local server for you automatically.</p>
    <div class="grid2" style="gap:12px;margin-bottom:16px">
      <div class="stat"><div class="l">🪟 Windows</div>
        <div style="font-size:.88rem;margin:8px 0;color:var(--muted)">Download <b>Start Ledger.bat</b>, put it in the same folder as index.html, double-click it. It starts a server and opens Ledger in your browser automatically.</div>
        <button class="btn primary" onclick="(function(){const bat=${JSON.stringify(bat)};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bat],{type:'text/plain'}));a.download='Start Ledger.bat';a.click();})()">⬇ Download Start Ledger.bat</button>
      </div>
      <div class="stat"><div class="l">🍎 Mac / Linux</div>
        <div style="font-size:.88rem;margin:8px 0;color:var(--muted)">Download <b>Start Ledger.command</b>, put it in the same folder, then <b>right-click → Open</b> (first time only to allow execution).</div>
        <button class="btn primary" onclick="(function(){const sh=${JSON.stringify(sh)};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([sh],{type:'text/plain'}));a.download='Start Ledger.command';a.click();})()">⬇ Download Start Ledger.command</button>
      </div>
    </div>
    <div class="stat" style="margin-bottom:14px"><div class="l">📱 Mobile &amp; anywhere without Python</div>
      <div style="font-size:.88rem;margin:8px 0;color:var(--muted);line-height:1.6">Host index.html on <b>GitHub Pages</b> (free, 30 seconds to set up) — gives you a stable <code>https://</code> URL that works on any device, supports Google OAuth, and you can install it as a home screen app (PWA):
      <ol style="margin-top:8px;padding-left:20px;line-height:2">
        <li>Create a free account at <a href="https://github.com" target="_blank">github.com</a></li>
        <li>New repository → upload index.html → enable GitHub Pages in Settings</li>
        <li>Your app is live at <code>https://username.github.io/ledger/</code></li>
        <li>Add the URL to your home screen (Share → Add to Home Screen on iOS)</li>
      </ol></div>
    </div>
    <div class="note">The launcher scripts open Ledger at <b>http://localhost:${port}</b> — add this to Authorised JavaScript origins in Google Cloud Console. The scripts can also live in your Google Drive / MEGA sync folder alongside index.html so they stay in sync across computers.</div>`,
    `<button class="btn" data-close>Maybe later</button>`);
}
async function gdConnect(){
  try{
    // Pre-flight checks before attempting OAuth
    if(window.location?.protocol==='file:'){showLauncherModal();return;}
    if(!OAUTH_CLIENT_ID){
      toast('OAUTH_CLIENT_ID is not configured in this build');
      return;
    }
    toast('Connecting to Google Drive…');
    await GD.connect();
    if(typeof showApp==='function')showApp();
    toast('Connected — syncing data…');
    await initDriveSync();
  }catch(e){
    // e may be an Error, a plain object, or a string depending on the failure point
    let msg;
    if(e instanceof Error)msg=e.message;
    else if(typeof e==='string')msg=e;
    else if(e?.type||e?.message)msg=e.type||e.message;
    else msg=JSON.stringify(e)||'Unknown error';
    if(msg.startsWith('ACCESS_DENIED:')){
      let email=msg.slice('ACCESS_DENIED:'.length).trim();if(email==='undefined'||email==='null'||!email)email='';
      toast('Access denied — '+(email||'that account')+' is not the registered account');
      if(typeof showAuthGate==='function')showAuthGate(`<b>Access denied.</b> <i>${email||'That account'}</i> is not authorised.<br>Please sign in with the registered account.`);
      return;
    }
    toast('Connection failed: '+msg);
    console.error('GDrive connect error:',e);
  }
}
async function rcptMigrateIDB(){
  if(!GD.isConnected()){toast('Connect Google Drive first');return;}
  const d=await idb();
  const all=await new Promise((res,rej)=>{const r=d.transaction('receipts').objectStore('receipts').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  if(!all.length){toast('No local receipts to migrate');return;}
  toast(`Migrating ${all.length} receipt(s) to Drive…`);
  let n=0;
  for(const rec of all){
    try{
      const file=new File([rec.blob],rec.name,{type:rec.type});
      const uploaded=await GD.upload(file);
      DB.rcptMeta=DB.rcptMeta||{};
      DB.rcptMeta[rec.id]={id:rec.id,name:rec.name,type:rec.type,store:'gdrive',driveId:uploaded.id};
      await idbDel(rec.id);
      save();n++;
    }catch(e){toast('Error migrating '+rec.name+': '+e.message);break;}
  }
  render();toast(n+' receipt(s) moved to Google Drive — your backups are now ' + n + ' files lighter!');
}
function updateSyncBtn(){
  const btn=document.getElementById('syncNowBtn');
  if(btn)btn.style.display=GD.isConnected()?'inline-flex':'none';
}
/* ================= CLEAN SLATE =================
   A granular "wipe and start fresh" tool. Each category is opt-in (ticking
   it means "delete this"); anything left unticked is untouched. Locked
   financial years are always skipped, respecting the lock. Two-step: an
   options modal, then a review listing exactly what will be deleted with a
   type-DELETE-to-confirm guard. A timestamped Drive snapshot is taken first
   (if connected) as a safety net, mirroring revertToVersion's pre-revert
   snapshot. */
let CLEAN_SLATE_SEL=null;
function cleanSlateOpen(){
  modal('Clean slate',`
    <p class="muted" style="margin-bottom:12px">Tick what you want to <b>permanently delete</b>. Anything left unticked is kept exactly as-is.</p>
    <label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px"><input type="checkbox" id="cs_tx" style="margin-top:3px"><span><b>Income, expenses, dividends, managed funds, share sales, WFH days &amp; budgets</b> — for every financial year. The financial years themselves (their dates, tax rates, lock status) are kept. Locked years are skipped.</span></label>
    <label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px"><input type="checkbox" id="cs_nw" style="margin-top:3px"><span><b>Net worth tracking</b> — every item and its value history.</span></label>
    <label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px"><input type="checkbox" id="cs_assets" style="margin-top:3px"><span><b>Assets</b> — properties, shares, ETFs/managed funds, vehicles. Also deletes any dividends/distributions linked to them.</span></label>
    <label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px"><input type="checkbox" id="cs_fy" style="margin-top:3px"><span><b>Financial year customisations</b> — clears custom display names, start/end date overrides, extra/removed holidays and family MLS settings on unlocked years. The years themselves and their tax rates are kept.</span></label>
    ${GD.isConnected()?`<label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" id="cs_drive" style="margin-top:3px"><span><b>Disconnect Google Drive</b> — your data in Drive is left as-is, but this device stops syncing until you reconnect.</span></label>`:''}
    <div class="note mt">People aren't included here — remove extra people in the People card above if needed.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn danger" onclick="cleanSlateReview()">Continue</button>`);
}
function cleanSlateReview(){
  const sel={
    tx:$('#cs_tx').checked, nw:$('#cs_nw').checked, assets:$('#cs_assets').checked,
    fy:$('#cs_fy').checked,
    drive:$('#cs_drive')?$('#cs_drive').checked:false,
  };
  const items=[];
  if(sel.tx)items.push('Income, expenses, dividends, managed funds, share sales, WFH days &amp; budgets in every <i>unlocked</i> financial year');
  if(sel.nw)items.push('Net worth items and their value history');
  if(sel.assets)items.push('All assets, and any dividends/distributions linked to them');
  if(sel.fy)items.push('Custom display names, date overrides, extra/removed holidays and family MLS settings on unlocked financial years');
  if(sel.drive)items.push('This device\u2019s Google Drive connection (disconnect only — Drive contents untouched)');
  if(!items.length){toast('Nothing selected');return;}
  CLEAN_SLATE_SEL=sel;
  modal('Confirm clean slate',`
    <p style="margin-bottom:10px">This will permanently delete:</p>
    <ul style="margin:0 0 12px 18px;line-height:1.7">${items.map(i=>`<li>${i}</li>`).join('')}</ul>
    <p class="muted" style="margin-bottom:12px">${GD.isConnected()?'A snapshot of everything as it stands right now will be saved to Drive first, so you can revert via <b>Version history</b> if this was a mistake.':'<b>This can\u2019t be undone</b> \u2014 Google Drive isn\u2019t connected, so no snapshot can be taken.'}</p>
    <label class="fld">Type DELETE to confirm</label>
    <input id="cs_confirm" class="input" oninput="$('#cs_go').disabled=this.value.trim()!=='DELETE'">`,
    `<button class="btn" data-close>Cancel</button><button class="btn danger" id="cs_go" disabled onclick="cleanSlateExecute()">Delete everything listed</button>`);
}
async function cleanSlateExecute(){
  const sel=CLEAN_SLATE_SEL;if(!sel)return;
  closeModal();
  let snapOk=false;
  if(GD.isConnected()){toast('Saving safety snapshot…');snapOk=await snapshotNow('prewipe');}
  if(sel.assets){
    [...DB.assets].forEach(a=>assetDeleteCascade(a.id));
  }
  if(sel.tx){
    Object.values(DB.years).forEach(y=>{
      if(y.locked)return;
      DB.people.forEach(p=>{y.people[p.id]=newBucket();});
      y.budgets=[];
    });
  }
  if(sel.nw){DB.nw={items:[],entries:[]};}
  if(sel.fy){
    Object.values(DB.years).forEach(y=>{
      if(y.locked)return;
      y.displayName='';y.rangeStart=null;y.rangeEnd=null;
      y.label=fyLabelFromStart(y.startYear+'-07-01');
      y.extraHolidays=[];y.removedHolidays=[];y.webHolidays=null;
      y.mlsFamily={enabled:false,dependents:1};
    });
  }
  if(sel.drive)DB.gdrive={...DB.gdrive,token:'',tokenExpiry:0};
  CLEAN_SLATE_SEL=null;
  save();initFYSelect();render();
  toast(`Clean slate done${snapOk?' — a snapshot was saved first':''}`);
}
function initFYSelect(){
  const sel=$('#fySelect');
  sel.innerHTML=`<option value="all" ${DB.currentFY==='all'?'selected':''}>All time</option>`+
    Object.values(DB.years).sort((a,b)=>fyOrderYear(b)-fyOrderYear(a))
    .map(y=>`<option value="${y.startYear}" ${String(y.startYear)===DB.currentFY?'selected':''}>${fyDisplay(y)}${y.locked?' 🔒':''}</option>`).join('');
}
function applyTheme(){document.documentElement.dataset.theme=DB.theme;}
load();
applyTheme();
$('#fySelect').addEventListener('change',e=>{DB.currentFY=e.target.value;save();autoRefreshHolidays();render();});
$$('#nav button').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
$('#themeBtn').addEventListener('click',()=>{DB.theme=DB.theme==='dark'?'light':'dark';save();applyTheme();});
$('#exportBtn').addEventListener('click',exportAll);
$('#importBtn').addEventListener('click',()=>$('#importFile').click());
$('#importFile').addEventListener('change',e=>{if(e.target.files[0])importAll(e.target.files[0]);e.target.value='';});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

/* ===== AUTH GATE ===== */
function showApp(){
  const gate=document.getElementById('authGate'),shell=document.getElementById('appShell');
  if(gate)gate.style.display='none';
  if(shell)shell.style.display='contents';
  initFYSelect();autoRefreshHolidays();autoRefreshPrices();go('dashboard');
  if(GD.isConnected())setTimeout(initDriveSync,500);
  updateSyncBtn();
}
function showAuthGate(errorMsg){
  const gate=document.getElementById('authGate'),shell=document.getElementById('appShell');
  if(shell)shell.style.display='none';
  if(gate)gate.style.display='flex';
  const errEl=document.getElementById('authError');
  if(errEl){errEl.style.display=errorMsg?'block':'none';errEl.innerHTML=errorMsg||'';}
  const note=document.getElementById('authSetupNote'),btn=document.getElementById('authSignInBtn');
  if(!OAUTH_CLIENT_ID&&note){
    note.style.display='block';
    note.innerHTML='<b>Setup required:</b> Open this file in a text editor, set <code>OAUTH_CLIENT_ID</code> near the top, then redeploy to GitHub Pages.';
    if(btn)btn.disabled=true;
  }
}
async function checkAuthAndStart(){
  // Already authenticated?
  if(GD.isConnected()){showApp();return;}
  // Have stored credentials but token expired — try silent re-auth
  if(OAUTH_CLIENT_ID&&GD.cfg.userEmail){
    try{
      await GD.loadGIS();
      const tok=await new Promise((res,rej)=>{
        const c=google.accounts.oauth2.initTokenClient({
          client_id:OAUTH_CLIENT_ID,scope:GD.SCOPES,
          callback:t=>{if(t.error)rej(new Error(t.error));else res(t);},
          error_callback:e=>rej(new Error(e?.type||'failed'))
        });
        c.requestAccessToken({prompt:'none',login_hint:GD.cfg.userEmail});
      });
      GD.token=tok;showApp();return;
    }catch(e){/* silent re-auth failed, fall through to show gate */}
  }
  showAuthGate();
}
async function authSignIn(){
  if(!OAUTH_CLIENT_ID){showAuthGate('Set <code>OAUTH_CLIENT_ID</code> in the file first.');return;}
  const btn=document.getElementById('authSignInBtn');
  if(btn){btn.disabled=true;btn.textContent='Signing in…';}
  const GICON='<svg width="18" height="18" viewBox="0 0 18 18" style="flex-shrink:0"><path fill="rgba(255,255,255,.9)" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z"/><path fill="rgba(255,255,255,.9)" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="rgba(255,255,255,.9)" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="rgba(255,255,255,.9)" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>';
  try{
    await GD.connect();
    showApp();
    toast('Welcome, '+(GD.cfg.userName||'')+'!');
    await initDriveSync();
  }catch(e){
    showAuthGate(e.message||String(e));
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML=GICON+' Sign in with Google';}
  }
}
checkAuthAndStart();


