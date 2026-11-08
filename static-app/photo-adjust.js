import {PHOTO_LIMITS,CURVE_LIMITS,photoSettings,photoTransform,curveTable,samplePaper} from './photo-color.js';

export function openPhotoTips(){
  if(document.querySelector('#photo-tips'))return;
  const dialog=document.createElement('dialog');dialog.id='photo-tips';dialog.setAttribute('aria-labelledby','photo-tips-title');
  dialog.innerHTML=`<header class="photo-heading"><h2 id="photo-tips-title">Photograph your pencil drawing</h2><button class="button secondary" aria-label="Close photography tips" type="button">×</button></header>
    <p>A clear, evenly lit photo needs only tiny adjustments.</p><ol>
    <li><strong>Find soft, even light.</strong> Work near a bright window, out of direct sunlight. Avoid mixing daylight with yellow room lights.</li>
    <li><strong>Keep shadows and glare off the paper.</strong> Move yourself and the iPad so they do not cast a shadow. If shiny pencil marks reflect the light, move the paper or light and try again. Turn flash off if your camera offers it.</li>
    <li><strong>Flatten the paper and clean the camera lens.</strong> Use the rear camera. Hold the iPad parallel to the page, with its camera above the center of the drawing.</li>
    <li><strong>Include all four corners.</strong> Fill most of the photo with the paper, leaving a small margin. Move closer rather than using digital zoom.</li>
    <li><strong>Focus and hold still.</strong> Tap the drawing to focus. In the iPad Camera app, adjust exposure if needed so the paper is bright but faint pencil marks remain visible.</li>
    <li><strong>Check before you use it.</strong> Look for sharp pencil lines, natural colors, and even light. Retake a blurry, strongly tinted, shadowy, or washed-out photo in better lighting.</li></ol>
    <p class="photo-hint">Then use Straighten photo and make small color corrections. These tools cannot recover pencil marks hidden by glare or blur.</p>
    <p class="photo-hint">More guidance: <a href="https://www.gov.nl.ca/tcar/artsheritage/culture/arts-and-letters-program/suggestions-for-photographing-your-artwork/" target="_blank" rel="noopener noreferrer">Photographing artwork</a> · <a href="https://support.apple.com/guide/ipad/ipad8a07fe4a/ipados" target="_blank" rel="noopener noreferrer">iPad focus and exposure</a></p>
    <form method="dialog" class="photo-actions"><button class="button">Got it</button></form>`;
  dialog.querySelector('header button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
}

export async function openPhotoAdjuster({source,settings,onApply}){
  if(document.querySelector('#photo-adjuster'))return;
  const image=new Image();image.src=source;await image.decode();
  if(document.querySelector('#photo-adjuster'))return;
  const initial=photoSettings(settings);let current=photoSettings(initial),channel='light',point=1,picking=false,comparing=false,applying=false,drag=null,timer;
  const photo=document.createElement('canvas');photo.width=image.naturalWidth;photo.height=image.naturalHeight;photo.getContext('2d').drawImage(image,0,0);
  const small=document.createElement('canvas'),scale=Math.min(1,640/Math.max(photo.width,photo.height));small.width=Math.max(1,Math.round(photo.width*scale));small.height=Math.max(1,Math.round(photo.height*scale));
  const smallCtx=small.getContext('2d',{willReadFrequently:true});smallCtx.drawImage(photo,0,0,small.width,small.height);const pixels=smallCtx.getImageData(0,0,small.width,small.height);
  let sample={x:Math.floor(small.width/2),y:Math.floor(small.height/2)};
  const dialog=document.createElement('dialog');dialog.id='photo-adjuster';dialog.setAttribute('aria-labelledby','adjust-title');
  const slider=(key,label,step=1)=>`<label class="adjust-slider">${label}<output for="adjust-${key}"></output><input id="adjust-${key}" data-adjust="${key}" type="range" min="${-PHOTO_LIMITS[key]}" max="${PHOTO_LIMITS[key]}" step="${step}" value="0"></label>`;
  dialog.innerHTML=`<header class="photo-heading"><h2 id="adjust-title">Adjust color</h2><button id="adjust-close" class="button secondary" aria-label="Cancel photo adjustments" type="button">×</button></header>
    <div class="adjust-body"><p class="adjust-intro">Make small corrections to match your drawing. If the photo needs a big change, retake it in better lighting.</p>
    <div class="adjust-columns"><section class="adjust-preview-section" aria-label="Photo preview"><div class="adjust-preview"><canvas id="adjust-preview" role="img" aria-label="Artwork photo preview" tabindex="0"></canvas><span id="adjust-sample-mark" hidden aria-hidden="true">+</span></div><p id="adjust-caption" class="photo-hint">Adjusted preview · the whole photo is shown; your card crop stays the same.</p><div class="adjust-preview-actions"><button id="adjust-original" class="button secondary" aria-pressed="false" type="button">Show original</button><button id="adjust-tips" class="button secondary" type="button">iPad photo tips</button></div><p id="adjust-status" class="photo-hint" role="status"></p></section>
    <section class="adjust-controls" aria-label="Photo controls"><h3>Light and color</h3>
    <button id="adjust-paper" class="button secondary" aria-pressed="false" type="button">Pick white paper</button><p class="photo-hint">Tap a blank area of white paper to correct its color cast. For cream or colored paper, use Warmth and Tint instead.</p>
    ${slider('exposure','Brightness',.01)}${slider('contrast','Contrast')}${slider('vibrance','Vibrance')}
    <details id="adjust-more"><summary>More adjustments</summary>${slider('whites','Paper brightness')}${slider('highlights','Highlights')}${slider('saturation','Saturation')}${slider('warmth','Warmth',.1)}${slider('tint','Tint',.1)}</details>
    <details id="adjust-curves"><summary>Curves</summary><p class="photo-hint">Lift or lower dark, middle, or light tones. Brightness keeps colors balanced. All curves have a small adjustment range.</p>
    <label class="adjust-select">Curve<select id="adjust-channel"><option value="light">Brightness</option><option value="red">Red</option><option value="green">Green</option><option value="blue">Blue</option></select></label>
    <svg id="adjust-curve" viewBox="0 0 320 240" aria-label="Tone curve. Use the three points or the tone slider below."><g class="curve-grid"><path d="M30 12V212H300 M30 12H300 M30 112H300 M165 12V212"/></g><path class="curve-histogram"/><path class="curve-identity" d="M30 212L300 12"/><path class="curve-band"/><path class="curve-line"/><g class="curve-handles"/><text x="30" y="233">Dark</text><text x="270" y="233">Light</text></svg>
    <label class="adjust-select">Tone<select id="adjust-point"><option value="0">Dark tones</option><option value="1" selected>Middle tones</option><option value="2">Light tones</option></select></label>
    <label class="adjust-slider">Curve adjustment<output for="adjust-curve-strength"></output><input id="adjust-curve-strength" type="range" min="-4" max="4" step=".25" value="0"></label><button id="adjust-curve-reset" class="button secondary" type="button">Reset this curve</button></details>
    <p class="photo-hint">Ranges and the combined effect are limited. Check that pale pencil marks and paper texture remain visible.</p></section></div>
    <p id="adjust-error" class="error" role="alert"></p><p class="photo-hint">Apply changes only this card side. The source photo stays in your image library.</p></div>
    <footer class="photo-actions"><button id="adjust-reset" class="button secondary" type="button">Reset all</button><button id="adjust-cancel" class="button secondary" type="button">Cancel</button><button id="adjust-apply" class="button" type="button">Apply adjustments</button></footer>`;
  const $=selector=>dialog.querySelector(selector),preview=$('#adjust-preview'),previewCtx=preview.getContext('2d'),svg=$('#adjust-curve'),NS='http://www.w3.org/2000/svg';preview.width=small.width;preview.height=small.height;
  const histogram=new Uint32Array(64);for(let i=0;i<pixels.data.length;i+=4)if(pixels.data[i+3])histogram[Math.min(63,Math.floor((.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2])/4))]++;
  const maxBin=Math.max(1,...histogram);svg.querySelector('.curve-histogram').setAttribute('d',`M30 212 ${Array.from(histogram,(n,i)=>`L${30+i/63*270} ${212-Math.sqrt(n/maxBin)*180}`).join(' ')} L300 212Z`);
  const handles=Array.from({length:3},(_,i)=>{
    const g=document.createElementNS(NS,'g');g.dataset.point=i;g.setAttribute('tabindex','0');g.setAttribute('role','slider');g.setAttribute('aria-orientation','vertical');g.setAttribute('aria-label',['Dark tones','Middle tones','Light tones'][i]);
    const hit=document.createElementNS(NS,'circle');hit.setAttribute('r','22');hit.setAttribute('class','curve-hit');const dot=document.createElementNS(NS,'circle');dot.setAttribute('r','6');g.append(hit,dot);svg.querySelector('.curve-handles').append(g);return g;
  });
  function syncControls(){
    for(const input of dialog.querySelectorAll('[data-adjust]')){input.value=current[input.dataset.adjust];input.previousElementSibling.value=`${Number(input.value)>0?'+':''}${Number(input.value).toFixed(input.dataset.adjust==='exposure'?2:1).replace(/\.0$/,'')}${input.dataset.adjust==='exposure'?' EV':''}`;}
    drawCurve();
  }
  function drawCurve(){
    const limit=CURVE_LIMITS[channel],table=curveTable(current.curves[channel]);
    const path=Array.from({length:65},(_,i)=>`${i?'L':'M'}${30+i/64*270} ${212-table[i*16]*200}`).join(' ');svg.querySelector('.curve-line').setAttribute('d',path);svg.dataset.channel=channel;
    svg.querySelector('.curve-band').setAttribute('d',`M30 ${212-limit*200}L300 ${12-limit*200}M30 ${212+limit*200}L300 ${12+limit*200}`);
    handles.forEach((handle,i)=>{const v=current.curves[channel][i];handle.setAttribute('transform',`translate(${30+(i+1)/4*270} ${212-((i+1)/4+v)*200})`);handle.setAttribute('aria-valuemin',-limit*100);handle.setAttribute('aria-valuemax',limit*100);handle.setAttribute('aria-valuenow',(v*100).toFixed(2));handle.setAttribute('aria-valuetext',`${(v*100).toFixed(2)} percent adjustment`);handle.classList.toggle('selected',i===point);});
    const control=$('#adjust-curve-strength');control.min=-limit*100;control.max=limit*100;control.value=current.curves[channel][point]*100;control.previousElementSibling.value=`${Number(control.value)>0?'+':''}${Number(control.value).toFixed(2)}%`;
  }
  function renderPreview(){
    clearTimeout(timer);const output=new ImageData(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height);if(!comparing)photoTransform(current)(output.data);previewCtx.putImageData(output,0,0);
    $('#adjust-caption').textContent=`${comparing?'Original source':'Adjusted preview'} · the whole photo is shown; your card crop stays the same.`;
    $('#adjust-apply').disabled=applying || JSON.stringify(current)===JSON.stringify(initial);
  }
  function schedule(){comparing=false;$('#adjust-original').setAttribute('aria-pressed','false');syncControls();clearTimeout(timer);timer=setTimeout(renderPreview,35);}
  function setPicking(value){picking=value;$('#adjust-paper').setAttribute('aria-pressed',String(value));preview.classList.toggle('picking',value);preview.setAttribute('aria-label',value?'Pick blank white paper. Use arrow keys to move the crosshair, then Enter to sample.':'Artwork photo preview');$('#adjust-sample-mark').hidden=!value;markSample();}
  function markSample(){const mark=$('#adjust-sample-mark');mark.style.left=`${sample.x/Math.max(1,small.width-1)*100}%`;mark.style.top=`${sample.y/Math.max(1,small.height-1)*100}%`;}
  function pick(){
    try{const balance=samplePaper(pixels.data,pixels.width,pixels.height,sample.x,sample.y);current.warmth=balance.warmth;current.tint=balance.tint;$('#adjust-status').textContent=balance.limited?'A small white-balance correction was applied. For a strong color cast, retake the photo in more neutral light.':'White balance set from the paper. Check it against your drawing.';setPicking(false);schedule();}
    catch(error){$('#adjust-status').textContent=error.message;}
  }
  $('#adjust-paper').onclick=()=>{setPicking(!picking);$('#adjust-status').textContent=picking?'Tap a blank, uncolored area of white paper. With a keyboard, focus the preview, move with arrow keys, and press Enter.':'';};
  preview.onpointerdown=event=>{if(!picking || applying)return;event.preventDefault();const rect=preview.getBoundingClientRect();sample={x:Math.round(Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*(small.width-1)),y:Math.round(Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))*(small.height-1))};pick();};
  preview.onkeydown=event=>{if(!picking || applying)return;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(delta){event.preventDefault();sample.x=Math.max(0,Math.min(small.width-1,sample.x+delta[0]*(event.shiftKey?10:1)));sample.y=Math.max(0,Math.min(small.height-1,sample.y+delta[1]*(event.shiftKey?10:1)));markSample();}else if(event.key==='Enter'||event.key===' '){event.preventDefault();pick();}};
  for(const input of dialog.querySelectorAll('[data-adjust]'))input.oninput=()=>{current[input.dataset.adjust]=Number(input.value);schedule();};
  $('#adjust-channel').onchange=()=>{channel=$('#adjust-channel').value;drawCurve();};$('#adjust-point').onchange=()=>{point=Number($('#adjust-point').value);drawCurve();};
  const changePoint=value=>{current.curves[channel][point]=Math.max(-CURVE_LIMITS[channel],Math.min(CURVE_LIMITS[channel],value));schedule();};
  $('#adjust-curve-strength').oninput=()=>changePoint(Number($('#adjust-curve-strength').value)/100);
  $('#adjust-curve-reset').onclick=()=>{current.curves[channel]=[0,0,0];schedule();};
  svg.onpointerdown=event=>{const handle=event.target.closest('[data-point]');if(!handle||applying||drag)return;event.preventDefault();point=Number(handle.dataset.point);$('#adjust-point').value=point;handle.focus();drag={id:event.pointerId,y:event.clientY,value:current.curves[channel][point]};svg.setPointerCapture(event.pointerId);drawCurve();};
  svg.onpointermove=event=>{if(!drag || drag.id!==event.pointerId)return;event.preventDefault();changePoint(drag.value+(drag.y-event.clientY)*.0005);};
  const finish=event=>{if(drag?.id===event.pointerId)drag=null;};svg.onpointerup=finish;svg.onpointercancel=finish;svg.onlostpointercapture=finish;
  svg.onkeydown=event=>{const index=event.target.dataset.point;if(index===undefined||applying)return;const direction={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[event.key];if(!direction && event.key!=='Home')return;event.preventDefault();point=Number(index);$('#adjust-point').value=point;changePoint(event.key==='Home'?0:current.curves[channel][point]+direction*(event.shiftKey?.01:.0025));};
  $('#adjust-original').onclick=()=>{comparing=!comparing;$('#adjust-original').setAttribute('aria-pressed',String(comparing));renderPreview();};
  $('#adjust-tips').onclick=openPhotoTips;
  $('#adjust-reset').onclick=()=>{current=photoSettings();setPicking(false);$('#adjust-status').textContent='All adjustments reset to the source photo.';schedule();};
  for(const id of ['adjust-close','adjust-cancel'])$('#'+id).onclick=()=>dialog.close();
  dialog.oncancel=event=>{if(applying)event.preventDefault();};dialog.onclose=()=>{clearTimeout(timer);dialog.remove();};
  $('#adjust-apply').onclick=async()=>{
    if(applying)return;applying=true;setPicking(false);clearTimeout(timer);dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);svg.style.pointerEvents='none';$('#adjust-apply').textContent='Applying…';$('#adjust-error').textContent='';
    try{
      const ctx=photo.getContext('2d'),output=ctx.getImageData(0,0,photo.width,photo.height),transform=photoTransform(current);
      // Yield between strips so a full-size iPad photo does not freeze the dialog.
      for(let y=0;y<photo.height;y+=32){transform(output.data,y*photo.width*4,Math.min(photo.height,y+32)*photo.width*4);await new Promise(resolve=>setTimeout(resolve,0));}
      const result=document.createElement('canvas');result.width=photo.width;result.height=photo.height;result.getContext('2d').putImageData(output,0,0);
      await onApply(result.toDataURL('image/png'),photoSettings(current));dialog.close();
    }catch(error){$('#adjust-error').textContent=error.message;}
    finally{applying=false;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);svg.style.pointerEvents='';$('#adjust-apply').textContent='Apply adjustments';renderPreview();}
  };
  document.body.append(dialog);dialog.showModal();syncControls();renderPreview();
}
