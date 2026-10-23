export const currencies={EUR:{label:'EUR · Euro',max:10000},USD:{label:'USD · US dollar',max:10000},GBP:{label:'GBP · British pound',max:10000},ISK:{label:'ISK · Icelandic króna',max:2000000},PHP:{label:'PHP · Philippine peso',max:1000000}};
const products={hoodie:'Hoodie',tee:'T-shirt',cap:'Cap',jersey:'Basketball jersey',tote:'Tote bag'};
export const collections={
 original:{title:'DJ-Buang / PHIL-ICE',designs:{'dj-buang':'DJ-Buang','phil-ice':'PHIL-ICE'},items:['hoodie','tee','cap','jersey']},
 'global-barangay':{title:'Global Barangay capsule',designs:{night:'Night Edition','island-ice':'Island / Ice Edition'},items:['hoodie','tee','cap','jersey','tote']}
};
export function merchOptions(collection){const c=collections[collection];if(!Object.hasOwn(collections,collection))return [];return Object.entries(c.designs).flatMap(([design,label])=>c.items.filter(item=>item!=='tote'||design==='island-ice').map(item=>({key:design+':'+item,design,item,label:label+' · '+products[item]})));}
export function validateMerchInterest(value){
 if(!value||value.confirmed!==true||value.website||!Object.hasOwn(collections,value.collection)||!Object.hasOwn(currencies,value.currency)||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value.id||''))throw Error('Please check the survey fields and acknowledgement.');
 const options=merchOptions(value.collection),seen=new Set();if(!Array.isArray(value.choices)||!value.choices.length||value.choices.length>options.length)throw Error('Choose at least one item.');
 const choices=value.choices.map(choice=>{const key=choice?.design+':'+choice?.item;if(seen.has(key)||!options.some(option=>option.key===key))throw Error('Please check your item selections.');seen.add(key);const price=choice.price;if(price!==null&&(typeof price!=='number'||!Number.isFinite(price)||price<0||price>currencies[value.currency].max||Math.abs(price*100-Math.round(price*100))>0.000001))throw Error('Enter a valid suggested price with up to two decimal places.');return {design:choice.design,item:choice.item,price};});
 return {id:value.id,collection:value.collection,currency:value.currency,choices};
}
