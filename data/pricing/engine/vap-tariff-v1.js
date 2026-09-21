'use strict';
const {buildBreakdown,VERSION}=require('./vap-bp33-v1');
function quantityUnits(rule,inputs){
 const q=inputs?.[rule.field],scale=10**rule.decimals;
 if(typeof q!=='number'||!Number.isFinite(q)||q<rule.min||q>rule.max||Math.abs(q*scale-Math.round(q*scale))>1e-8)throw Error('Quantity outside approved scope');
 return {units:Math.round(q*scale),scale};
}
function tariffBreakdown(tariff,inputs){
 if(tariff.quantity_guard)quantityUnits(tariff.quantity_guard,inputs);
 let vap=tariff.vap_minor;
 if(tariff.vap_quantity){
  const rule=tariff.vap_quantity,{units,scale}=quantityUnits(rule,inputs);
  if(!Number.isSafeInteger(rule.unit_minor)||rule.unit_minor<=0)throw Error('Invalid VAP rate');
  // Integer centimes, half-up rounding once, before the progressive commission.
  const product=units*rule.unit_minor;if(!Number.isSafeInteger(product))throw Error('VAP overflow');
  vap=Math.floor((product+scale/2)/scale);
 }
 return buildBreakdown({pricingVersion:VERSION,vapMinor:vap,materialsMinor:tariff.materials_minor||0});
}
module.exports={quantityUnits,tariffBreakdown};
