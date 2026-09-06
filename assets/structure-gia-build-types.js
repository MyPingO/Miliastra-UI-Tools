(()=>{
'use strict';

/* The pinned core already defines the complete Structure GIA Build New set.
   Use that authoritative set directly. Struct / StructList are intentionally
   absent because their serialized defaults depend on an external custom
   Structure definition that Build New does not know. */
if(typeof structureGiaBuildTypeOptions==='function'&&Array.isArray(STRUCTURE_GIA_BUILD_TYPE_CODES)){
  structureGiaBuildTypeOptions=function(){
    return STRUCTURE_GIA_BUILD_TYPE_CODES
      .filter(typeCode=>Number(typeCode)!==25&&Number(typeCode)!==26)
      .map(typeCode=>({
        typeCode:Number(typeCode),
        name:structureGiaTypeName(Number(typeCode))
      }));
  };
}

})();
