const state={projects:[],category:"all",query:"",sort:"featured"};
const $=id=>document.getElementById(id);
const safe=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function categories(){return [...new Set(state.projects.map(p=>p.category))].sort();}
function setupFilters(){
 const select=$("category");
 for(const category of categories()){const option=document.createElement("option");option.value=category;option.textContent=category;select.append(option);}
 const chips=$("category-chips");
 chips.innerHTML=["all",...categories()].map(c=>`<button class="chip ${c==="all"?"active":""}" type="button" data-category="${safe(c)}">${c==="all"?"All":safe(c)}</button>`).join("");
 chips.addEventListener("click",event=>{const button=event.target.closest("button[data-category]");if(!button)return;state.category=button.dataset.category;select.value=state.category;chips.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===button));render();});
}
function formatDate(value){if(!value)return "Unknown";const date=new Date(value);return Number.isNaN(date.getTime())?"Unknown":new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}).format(date);}
function render(){
 const query=state.query.trim().toLowerCase();
 let projects=state.projects.filter(p=>(state.category==="all"||p.category===state.category)&&[p.name,p.description,p.category,...(p.tags||[])].join(" ").toLowerCase().includes(query));
 if(state.sort==="az")projects.sort((a,b)=>a.name.localeCompare(b.name));else projects.sort((a,b)=>(a.order??999)-(b.order??999));
 $("project-count").textContent=`${projects.length} of ${state.projects.length} projects`;
 $("project-grid").innerHTML=projects.map(p=>`<article class="project-card"><div class="card-top"><span class="project-icon" aria-hidden="true">${safe(p.icon||p.name.slice(0,1))}</span><span class="tag">${safe(p.category)}</span></div><h3>${safe(p.name)}</h3><p>${safe(p.description)}</p><div class="card-bottom"><span>${safe((p.tags||[]).slice(0,2).join(" · "))}</span><a href="${safe(p.repository)}" target="_blank" rel="noopener noreferrer">View source ↗</a></div><div class="repo-meta"><span>★ ${p.repository_metadata?.stars==null?"—":safe(p.repository_metadata.stars.toLocaleString())} stars</span><span>${safe(p.repository_metadata?.license_spdx||"License not detected")}</span><span>Pushed ${safe(formatDate(p.repository_metadata?.pushed_at))}</span></div></article>`).join("");
 $("empty-state").hidden=projects.length!==0;
}
async function init(){
 $("year").textContent=new Date().getFullYear();
 try{const response=await fetch("data/projects.json",{cache:"no-store"});if(!response.ok)throw new Error("Project data could not be loaded");const data=await response.json();state.projects=Array.isArray(data.projects)?data.projects:[];setupFilters();render();}
 catch(error){$("project-grid").innerHTML='<p class="loading">The project directory could not be loaded. Please refresh or visit the repository.</p>';$("project-count").textContent="Directory unavailable";console.error(error);}
 $("search").addEventListener("input",event=>{state.query=event.target.value;render();});
 $("category").addEventListener("change",event=>{state.category=event.target.value;$("category-chips").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.category===state.category));render();});
 $("sort").addEventListener("change",event=>{state.sort=event.target.value;render();});
}
init();