'use strict';
const {buildBreakdown,VERSION}=require('./vap-bp33-v1');
function quantityUnits(rule,inputs){
 if(!rule || typeof rule.field!=='string' || !Number.isInteger(rule.decimals) || rule.decimals<0 || rule.decimals>6 || !Number.isFinite(rule.min) || !Number.isFinite(rule.max) || rule.min<0 || rule.max<rule.min)throw Error('Invalid quantity rule');
 const q=inputs?.[rule.field],scale=10**rule.decimals;
 if(typeof q!=='number'||!Number.isFinite(q)||q<rule.min||q>rule.max||!Number.isSafeInteger(Math.round(q*scale))||Math.abs(q*scale-Math.round(q*scale))>1e-8)throw Error('Quantity outside approved scope');
 return {units:Math.round(q*scale),scale};
}
function quantityAmount(rule,inputs,label){
 const {units,scale}=quantityUnits(rule,inputs);
 if(!Number.isSafeInteger(rule.unit_minor)||rule.unit_minor<=0)throw Error('Invalid '+label+' rate');
 const minimum=rule.minimum_minor===undefined?0:rule.minimum_minor;
 if(!Number.isSafeInteger(minimum)||minimum<0)throw Error('Invalid '+label+' minimum');
 // Half-up centimes once per component. Materials never enter the fee base.
 const product=BigInt(units)*BigInt(rule.unit_minor),divisor=BigInt(scale);
 const rounded=(2n*product+divisor)/(2n*divisor);
 if(rounded>BigInt(Number.MAX_SAFE_INTEGER))throw Error(label+' overflow');
 return Math.max(Number(rounded),minimum);
}
function tariffBreakdown(tariff,inputs){
 if(tariff.quantity_guard)quantityUnits(tariff.quantity_guard,inputs);
 let vap=tariff.vap_minor;
 if(tariff.vap_quantity)vap=quantityAmount(tariff.vap_quantity,inputs,'VAP');
 let materials=tariff.materials_minor;
 if(tariff.materials_quantity){
  if(materials!==0)throw Error('Variable materials require explicit zero fixed materials');
  materials=quantityAmount(tariff.materials_quantity,inputs,'materials');
 }
 // Existing fixed labour-only models may omit the materials field.
 if(materials===undefined)materials=0;
 return buildBreakdown({pricingVersion:VERSION,vapMinor:vap,materialsMinor:materials});
}
module.exports={quantityUnits,tariffBreakdown};
