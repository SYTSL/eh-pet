// Music owns the animation while playing, including when the pet is moved.
(() => {
 const P=PetSprite.prototype;
 const switchTo=P.switchTo,playOnce=P.playOnce,playIdle=P.playIdle,ended=P.handleEnded,dispose=P.dispose;
 const names={music:{intro:'music-intro',loop:'music-loop',outro:'music-outro'},drag:{intro:'zhuai-intro',loop:'zhuai-loop',outro:'zhuai-outro'},mine:{intro:'mine-intro',loop:'mine-loop',outro:'mine-outro'}};
 P.stagedDesired=function(){
  const audio=this.musicAudio;
  if(audio&&!audio.paused&&!audio.ended&&!audio.error)return 'music';
  return this.stagedDragging&&this.stagedAction?.kind!=='music'?'drag':null;
 };
 P.stagedPlay=function(kind,phase){
  this.stopMove();this.pendingSquash=false;
  this.stagedAction={kind,phase};this.anim=names[kind][phase];this.once=phase!=='loop';
  switchTo.call(this,this.anim,this.once);
 };
 P.stagedSync=function(){
  if(this.assetRoot!=='eh'||this.ac?.signal.aborted)return;
  const want=this.stagedDesired();
  if(this.stagedAction?.kind==='mine'){
   if(!want)return;
   this.stopMining();
  }
  const current=this.stagedAction;
  if(!current){if(want)this.stagedPlay(want,'intro');return}
  if(want==='music'&&current.kind==='drag'){this.stagedPlay('music','intro');return}
  if(want==='drag'&&(current.kind!=='drag'||current.phase==='outro')){this.stagedPlay('drag','intro');return}
  if(want!==current.kind&&current.phase!=='outro')this.stagedPlay(current.kind,'outro');
 };
 P.beginStagedDrag=function(){if(this.assetRoot!=='eh')return false;this.stagedDragging=true;this.stagedSync();return true};
 P.endStagedDrag=function(){if(this.assetRoot!=='eh'||!this.stagedDragging)return false;this.stagedDragging=false;this.stagedSync();return true};
 P.attachStagedAudio=function(){
  if(!this.musicAudio)return;
  this.musicAudio.addEventListener('play',()=>{clearTimeout(this.stagedPauseTimer);this.stagedSync()},{signal:this.ac.signal});
  const stopped=()=>{clearTimeout(this.stagedPauseTimer);this.stagedPauseTimer=setTimeout(()=>this.stagedSync(),80)};
  for(const event of ['pause','ended','error'])this.musicAudio.addEventListener(event,stopped,{signal:this.ac.signal});
 };
 P.handleEnded=function(completedAnim){
  const action=this.stagedAction;if(!action)return ended.call(this);
  if(completedAnim && completedAnim!==names[action.kind][action.phase])return;
  if(action.phase==='intro'){
   this.stagedPlay(action.kind,action.kind==='mine'||this.stagedDesired()===action.kind?'loop':'outro');
  }else if(action.phase==='outro'){
   this.stagedAction=null;
   const want=this.stagedDesired();if(want)this.stagedPlay(want,'intro');else playIdle.call(this);
  }
 };
 P.switchTo=function(...args){if(!this.stagedAction)return switchTo.apply(this,args)};
 P.playOnce=function(...args){if(!this.stagedAction)return playOnce.apply(this,args)};
 P.playIdle=function(...args){if(!this.stagedAction)return playIdle.apply(this,args)};
 P.dispose=function(){clearTimeout(this.stagedPauseTimer);this.stopMining?.();this.stagedAction=null;return dispose.call(this)};
})();
