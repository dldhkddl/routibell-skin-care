export function createResultPhoto({createUrl=blob=>URL.createObjectURL(blob),revokeUrl=url=>URL.revokeObjectURL(url),now=Date.now,schedule=setTimeout,cancel=clearTimeout,onExpire=()=>{}}={}){
  let address='',completedAt=null,expiresAt=0,timer=null;
  function clear(){if(timer!==null)cancel(timer);if(address)revokeUrl(address);address='';completedAt=null;expiresAt=0;timer=null;}
  return {
    remember(blob){clear();address=createUrl(blob);expiresAt=now()+1800000;timer=schedule(()=>{clear();onExpire();},1800000);},
    bind(value){if(!address)return;if(completedAt&&completedAt!==value){clear();return;}completedAt=value;},
    read(value){if(address&&now()>=expiresAt)clear();return value&&completedAt===value?address:'';},
    clear,
  };
}
