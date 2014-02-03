/*
 * CHAIN
 */
exports.chain = {
  mixinCallback: function(){
    //returns a pseudo record
    this.__defineGetter__('every', function(){
      var self = this;
      var pseudo = new this.model();

      

      for(var name in pseudo){
        
        (function(name, value){
          if(typeof value == 'function'){
            //replace methods
            pseudo[name] = function(){
              for(var i = 0; i < self.length; i++){
                var record = self[i];
                record[name].apply(record, arguments);
              }
            }
            
          }else{
            //replace attribute
            pseudo.__defineGetter__(name, function(){
              var tmp = [];
              for(var i = 0; i < self.length; i++){
                var record = self[i];
                tmp.push(record[name]);
              }
              return tmp;
            });
            
            
            pseudo.__defineSetter__(name, function(value){
              for(var i = 0; i < self.length; i++){
                var record = self[i];
                record[name] = value;
              }
            });
          }
        })(name, pseudo[name]);
        
      }
      
      return pseudo;
            
    });
  }
};