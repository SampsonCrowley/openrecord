var Utils = require('../../utils')

/*
 * DEFINITION
 */
exports.definition = {
  /**
   * This validator checks the uniqness of the given field`s value before save.
   * @class Definition
   * @method validatesUniquenessOf
   * @param {array} fields - The fields to validate
   * @or
   * @param {string} fields - The field to validate
   * @param {object} options - Optional: Options hash
   *
   * @options
   * @param {string} scope - Set a scope column
   *
   * @return {Definition}
   */
  validatesUniquenessOf: function(){
    var args = Utils.args(arguments)
    if(args.length > 1 && typeof args[1] === 'string'){
      return this.validateFieldsHelper(args, this.validatesUniquenessOf)
    }

    var field = args[0]
    var options = args[1] || {}
    var self = this

    if(Array.isArray(field)){
      return this.validateFieldsHelper(field, [options], this.validatesUniquenessOf)
    }

    return this.validates(field, function(next){
      var record = this
      var primaryKeys = self.primary_keys
      var condition = {}
      var i

      if(this[field] === null){
        return next(true)
      }

      if(!this.hasChanged(field)){
        return next(true)
      }

      var attr = self.attributes[field]
      condition[field] = attr.type.cast.write.call(this, this[field])

      for(i = 0; i < primaryKeys.length; i++){
        if(this[primaryKeys[i]]){
          condition[primaryKeys[i] + '_not'] = this[primaryKeys[i]]
        }
      }

      if(options.scope){
        if(!Array.isArray(options.scope)) options.scope = [options.scope]

        for(i = 0; i < options.scope.length; i++){
          condition[options.scope[i]] = this[options.scope[i]]
        }
      }


      self.model.count().where(condition).exec(function(result){
        if(result > 0){
          record.errors.add(field, 'not uniq')
          return next(false)
        }
        next(true)
      })
    })
  }
}
