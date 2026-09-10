import {capabilityAvailability,validateCapabilityInput} from './capabilities.mjs';
export function authorizeCapabilityInvocation({registry,capabilityId,input,availabilityContext={}}={}){const capability=registry?.get?.(capabilityId);if(!capability)return{accepted:false,reasonCode:'CAPABILITY_UNKNOWN'};let validated;try{validated=validateCapabilityInput(capabilityId,input)}catch(error){return{accepted:false,reasonCode:error.code||'CAPABILITY_INPUT_INVALID'};}if(!capabilityAvailability(capabilityId,availabilityContext).available)return{accepted:false,reasonCode:'CAPABILITY_UNAVAILABLE'};return{accepted:true,capability,input:validated};}
export async function dispatchCapability(options={}){
  const capability=options.registry?.get?.(options.capabilityId);if(!capability)return{accepted:false,reasonCode:'CAPABILITY_UNKNOWN'};
  let input;try{input=validateCapabilityInput(capability.id,options.input)}catch(error){return{accepted:false,reasonCode:error.code||'CAPABILITY_INPUT_INVALID'};}
  const fingerprint=options.fingerprint?.({capabilityId:capability.id,sourceRunId:options.sourceRunId,input});
  if(options.lookupInvocation){const prior=await options.lookupInvocation(options.invocationId);if(prior){if(prior.fingerprint!==fingerprint)return{accepted:false,reasonCode:'INVOCATION_CONFLICT'};return{...prior.acknowledgement,accepted:true,idempotent:true};}}
  if(!capabilityAvailability(capability.id,options.availabilityContext||{}).available)return{accepted:false,reasonCode:'CAPABILITY_UNAVAILABLE'};
  const handler=options.handlers?.[capability.id];if(typeof handler!=='function')return{accepted:false,reasonCode:'CAPABILITY_HANDLER_UNAVAILABLE'};
  return handler(input,capability,{fingerprint});
}
