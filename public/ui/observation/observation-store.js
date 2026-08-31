export class ObservationStore {
  constructor(onChange){this.onChange=onChange;this.run=null;this.projection=null;this.system=null;this.stream=null;this.refreshTimer=null;this.systemTimer=null;this.seenOperations=new Set();this.pendingLiveInput=null}
  async attach(id){
    this.stream?.close();clearTimeout(this.refreshTimer);clearInterval(this.systemTimer);this.pendingLiveInput=null;
    const [run,projection,system]=await Promise.all([fetch('/api/runs/'+id).then(r=>r.json()),fetch('/api/runs/'+id+'/observation').then(r=>r.json()),fetch('/api/system').then(r=>r.json()).catch(()=>null)]);
    this.run=run;this.projection=projection;this.system=system;this.seenOperations=new Set((run.events||[]).map(event=>event.payload?.operationId).filter(Boolean));this.emit();
    this.stream=new EventSource('/api/runs/'+id+'/events?after='+(run.events.at(-1)?.eventId||0));
    this.stream.addEventListener('runtime',event=>{const value=JSON.parse(event.data);if(this.run.events.some(item=>item.eventId===value.eventId))return;this.run.events.push(value);this.run.events.sort((a,b)=>a.sequence-b.sequence);const operationId=value.payload?.operationId,displayInput=value.payload?.displayInput;if(operationId&&displayInput&&!this.seenOperations.has(operationId)){this.seenOperations.add(operationId);this.pendingLiveInput={operationId,sequence:value.sequence,displayInput}}const states={RunCompleted:'completed',RunFailed:'failed',RunCancelled:'cancelled',RunInterrupted:'interrupted',RunNeedsContext:'needs-context'};if(states[value.type]){this.run.status=states[value.type];this.run.reasonCode=value.payload?.reasonCode||this.run.reasonCode}this.scheduleRefresh()})
  }
  scheduleRefresh(){clearTimeout(this.refreshTimer);this.refreshTimer=setTimeout(()=>this.refresh(),60)}
  async refresh(){if(!this.run)return;try{this.projection=await fetch('/api/runs/'+this.run.id+'/observation').then(r=>r.json());this.emit()}catch{};if(!this.systemTimer)this.systemTimer=setInterval(async()=>{this.system=await fetch('/api/system').then(r=>r.json()).catch(()=>this.system);this.emit()},2000)}
  emit(){if(!this.projection)return;const liveInput=this.pendingLiveInput;this.pendingLiveInput=null;this.onChange({...this.projection,system:this.system},{liveInput})}
  close(){this.stream?.close();clearTimeout(this.refreshTimer);clearInterval(this.systemTimer)}
}
