
/*
 * MODEL
 */
exports.model = {
  /**
   * Adds a context object to your Model which could be used by your Hooks, Validation or Events via `this.context`
   * This is especially usefull need to differentiate things based on e.g. the cookie. Just set the context to the current request (`Model.setContext(req).create(params))` and use `this.context` inside your `beforeCreate()` hook.
   * The `context` Variable is available on your Model an all it's Records.
   *
   * @class Model
   * @method setContext
   * @param {object} context - Your context object
   *
   * @return {Model}
   */
  setContext: function(context){
    var self = this.chain()

    self.setInternal('context', context)

    self.callInterceptors('onContext', [context], function(okay){
      // we use interceptors here even though there isn't anything to intercept...
    })

    return self
  }
}


/*
 * CHAIN
 */
exports.chain = {
  mixinCallback: function(){
    this.__defineGetter__('context', function(){
      return this.getInternal('context')
    })
  }
}


/*
 * RECORD
 */
exports.record = {
  mixinCallback: function(){
    this.__defineGetter__('context', function(){
      return this.__context || (this.__chained_model ? this.__chained_model.getInternal('context') : {})
    })
  }
}


exports.definition = {
  mixinCallback: function(){
    this.on('relation_record_added', function(parent, options, record){
      record.__defineGetter__('__context', function(){
        return parent.context
      })
    })
  }
}
