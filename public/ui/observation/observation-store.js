export class ObservationStore {
  constructor(onChange){this.onChange=onChange;this.run=null;this.available=[];this.projection=null;this.stream=null;this.refreshTimer=null}
  async attach(id){this.stream?.close();const [run,caps,projection]=await Promise.all([fetch('/api/runs/'+id).then(r=>r.json()),fetch('/api/runtime/capabilities').then(r=>r.json()),fetch('/api/runs/'+id+'/observation').then(r=>r.json())]);this.run=run;this.available=caps.capabilities||[];this.projection=projection;this.emit();this.stream=new EventSource('/api/runs/'+id+'/events?after='+(run.events.at(-1)?.sequence||0));this.stream.addEventListener('runtime',event=>{const value=JSON.parse(event.data);if(!this.run.events.some(item=>item.sequence===value.sequence)){this.run.events.push(value);this.run.events.sort((a,b)=>a.sequence-b.sequence);if(value.type==='RunCompleted')this.run.status=value.payload?.status||'completed';if(value.type==='RunFailed')this.run.status='failed';this.emit();this.scheduleRefresh()}})}
  scheduleRefresh(){clearTimeout(this.refreshTimer);this.refreshTimer=setTimeout(()=>this.refresh(),80)}
  async refresh(){if(!this.run)return;try{this.projection=await fetch('/api/runs/'+this.run.id+'/observation').then(r=>r.json());this.emit()}catch{}}
  emit(){if(this.projection)this.onChange(this.projection)}
  close(){this.stream?.close();clearTimeout(this.refreshTimer)}
}
