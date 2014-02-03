/*
 * MODEL
 */
exports.model = {
  limit: function(limit, offset){
    var self = this.chain();
    offset = offset || 0;
  
    self.setInternal('limit', limit);
    self.setInternal('offset', offset);
  
    return self;
  }
};



/*
 * DEFINITION
 */
exports.definition = {
  mixinCallback: function(){
     
    this.beforeFind(function(query){
      var limit = this.getInternal('limit');
      var offset = this.getInternal('offset');
      
      if(limit){
        query.limit(limit);
        query.offset(offset);
      }
      
      return true;
    });
    
    
    this.afterFind(function(data){
      var limit = this.getInternal('limit');
      
      if(limit == 1){
        data.result = data.result[0];
      }
      
      return true;
    }, 40);
    
  }
};