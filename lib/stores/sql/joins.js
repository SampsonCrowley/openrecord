var Utils = require('../../utils')
var async = require('async')


/*
 * MODEL
 */
exports.model = {
  /**
   * Joins one or multiple relations with the current model
   * @class Model
   * @method join
   * @param {string} relation - The relation name which should be joined.
   * @param {string} type - Optional join type (Allowed are `left`, `inner`, `outer` and `right`).
   * @or
   * @param {array} relations - Array of relation names
   * @or
   * @param {object} relations - For nested relational joins use objects
   *
   * @see Model.exec
   *
   * @return {Model}
   */
  join: function(relations, type){
    var self = this.chain()

    // format of relations = ['JOIN ....', [args]]
    if(Array.isArray(relations) && typeof relations[0] === 'string' && relations[0].match(/join/i)){
      self.addInternal('joins', {
        type: 'custom',
        query: relations[0],
        args: relations[1] || []
      })
      return self
    }

    // format of relations = 'JOIN ...'
    if(typeof relations === 'string' && relations.match(/join/i)){
      self.addInternal('joins', {
        type: 'custom',
        query: relations,
        args: []
      })
      return self
    }

    if(typeof type === 'string' && ['left', 'inner', 'outer', 'right'].indexOf(type.toLowerCase()) !== -1){
      if(!Array.isArray(relations)){
        relations = [relations]
      }
    }else{
      relations = Utils.args(arguments)
      type = 'left'
    }

    relations = Utils.sanitizeRelations(self, relations)

    for(var i = 0; i < relations.length; i++){
      if(relations[i].relation.polymorph){
        throw new Error("Can't join polymorphic relations")
      }else{
        self.addInternal('joins', {
          relation: relations[i].relation,
          type: type,
          parent: relations[i].parent,
          name_tree: relations[i].name_tree,
          as: relations[i].as
        })
      }
    }

    return self
  },


  /**
   * Left joins one or multiple relations with the current model
   * @class Model
   * @method leftJoin
   * @param {string} relation - The relation name which should be joined.
   * @or
   * @param {array} relations - Array of relation names
   * @or
   * @param {object} relations - For nested relational joins use objects
   *
   * @see Model.exec
   *
   * @return {Model}
   */
  leftJoin: function(){
    return this.join(Utils.args(arguments), 'left')
  },


  /**
   * Right joins one or multiple relations with the current model
   * @class Model
   * @method rightJoin
   * @param {string} relation - The relation name which should be joined.
   * @or
   * @param {array} relations - Array of relation names
   * @or
   * @param {object} relations - For nested relational joins use objects
   *
   * @see Model.exec
   *
   * @return {Model}
   */
  rightJoin: function(){
    return this.join(Utils.args(arguments), 'right')
  },


  /**
   * Inner joins one or multiple relations with the current model
   * @class Model
   * @method innerJoin
   * @param {string} relation - The relation name which should be joined.
   * @or
   * @param {array} relations - Array of relation names
   * @or
   * @param {object} relations - For nested relational joins use objects
   *
   * @see Model.exec
   *
   * @return {Model}
   */
  innerJoin: function(){
    return this.join(Utils.args(arguments), 'inner')
  },


  /**
   * Outer joins one or multiple relations with the current model
   * @class Model
   * @method outerJoin
   * @param {string} relation - The relation name which should be joined.
   * @or
   * @param {array} relations - Array of relation names
   * @or
   * @param {object} relations - For nested relational joins use objects
   *
   * @see Model.exec
   *
   * @return {Model}
   */
  outerJoin: function(){
    return this.join(Utils.args(arguments), 'outer')
  }
}



/*
 * DEFINITION
 */
exports.definition = {

  mixinCallback: function(){
    var self = this

    this._autojoin = {}

    this.beforeFind(function(query, next){
      var i
      var conditions

      if(self._autojoin.enabled){
        conditions = this.getInternal('conditions') || []
        var relations = []
        for(i = 0; i < conditions.length; i++){
          if(conditions[i].name_tree.length > 0){
            if(self._autojoin.relations.length === 0 || self._autojoin.relations.indexOf(conditions[i].name_tree[conditions[i].name_tree.length - 1]) !== -1){
              relations.push(Utils.nameTreeToRelation(conditions[i].name_tree))
            }
          }
        }
        if(relations.length > 0){
          this.join(relations)
        }
      }


      var joins = this.getInternal('joins') || []
      var tableMap = {}
      var calls = []


      for(i = 0; i < joins.length; i++){
        if(joins[i].type === 'custom'){
          (function(sql, args){
            calls.push(function(done){
              query.joinRaw(sql, args)
              done()
            })
          })(joins[i].query, joins[i].args)
          continue
        }

        var relation = joins[i].relation
        var nameTree = joins[i].name_tree

        // if the same table is joined multiple times
        if(tableMap[nameTree.join('.')]){
          // remove it
          joins.splice(i, 1)
          i--
          // and continue with the next one
          continue
        }

        var tableName = relation.model.definition.table_name
        var name = Utils.nameTreeToNames(tableName, nameTree)

        var as = ''

        if(tableName !== name){
          as = ' AS ' + name
        }

        joins[i].name = name
        tableMap[nameTree.join('.')] = name

        // to support raw conditions and some others (like IN(), BETWEEN ...), we need to use a litte hack... knex only supports "attribute, operator, attribute"-style (on(), andOn(), orOn())
        conditions = Utils.sanitizeConditions(relation.model, Utils.clone(relation.conditions), nameTree, relation)
        var xquery = this.definition.store.connection('x')
        var _self = this;

        (function(conditions, xquery, join, tableName, as){
          calls.push(function(done){
            // generate the sql query and remove the `select * from x where` part...
            _self._applyCondtions(Utils.reverseConditions(conditions), xquery, function(){
              var sql = xquery.toString().replace(/select \* from .x. where /i, '')
              // now put the raw condition query into the join...
              query[join.type + 'Join'](tableName + as, self.store.connection.raw(sql))
              done()
            })
          })
        })(conditions, xquery, joins[i], tableName, as)
      }

      this.setInternal('table_map', tableMap)


      if(calls.length === 0){
        return next()
      }

      async.parallel(calls, function(err){
        next(err)
      })
    }, -20)



    this.afterFind(function(data){
      self.logger.trace('sql/joins', data)
      var records = data.result
      var joins = this.getInternal('joins') || []

      if(joins.length === 0) return true


      // Combines arrays of records and subrecords by their key
      var deepCombine = function(data, primaryKeys, depth){
        var keys = {}
        var records = []

        depth = depth || 0

        for(var r in data){
          var key = []

          if(primaryKeys.length > 0){
            for(var p in primaryKeys){
              key.push(data[r][primaryKeys[p]])
            }
            key = key.join(',')
          }else{
            key = r
          }

          if(!keys[key]){
            keys[key] = data[r]
            records.push(data[r])
          }else{
            for(var i in joins){
              var relation = joins[i].relation
              var names = joins[i].name_tree

              if(relation.type === 'has_many' || relation.type === 'belongs_to_many'){
                var sub = data[r][names[depth]]
                var ori = keys[key][names[depth]]

                if(ori && sub){
                  if(ori && !Array.isArray(ori)){
                    keys[key][names[depth]] = ori = [ori]
                  }

                  ori.push(sub)
                  keys[key][names[depth]] = deepCombine(ori, relation.model.definition.primary_keys, depth + 1)
                }
              }
            }
          }
        }

        return records
      }

      data.result = deepCombine(records, self.primary_keys)
      return true
    }, 90)
  },




  /**
   * Enable automatic joins on tables referenced in conditions
   * @class Definition
   * @method autoJoin
   * @param {object} options - Optional configuration options
   *
   * @options
   * @param {array} relations - Only use the given relations for the automatic joins.
   * @param {integer} limit - how many joins are allowed
   *
   * @return {Definition}
   */
  autoJoin: function(options){
    this._autojoin = options || {}
    this._autojoin.enabled = true
    this._autojoin.relations = this._autojoin.relations || []
    return this
  }
}
