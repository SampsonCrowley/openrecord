
exports.migration = {
  nestedSet: function(){
    this.integer('lft')
    this.integer('rgt')
    this.integer('depth')
    this.integer('parent_id', {default: 0})
  }
}


exports.definition = {

  nestedSet: function(){
    var self = this

    this.attribute('leaf', Boolean, {
      writable: false,
      default: true
    })

    this.hasMany('children', {model: this.getName(), foreign_key: 'parent_id'})
    this.belongsTo('parent', {model: this.getName()})

    this.scope('byLevel', function(level){
      this.where({depth: level})
    })

    this.scope('rootOnly', function(){
      this.byLevel(0)
    })

    this.scope('withChildren', function(){
      this.include('children')
    })

    this.scope('withAllChildren', function(depth){
      if(depth === 1){
        this.withChildren()
      }else{
        this.setInternal('nested_set_with_children_depth', depth)
        this.setInternal('nested_set_with_children', true)
      }
    })



    // helper for withAllChildren
    this.afterFind(function(data, done){
      var withChildren = this.getInternal('nested_set_with_children')
      var depth = this.getInternal('nested_set_with_children_depth')
      var records = data.result || []
      var record
      var i

      if(!Array.isArray(records)) records = [records]

      // set leaf attribute
      for(i = 0; i < records.length; i++){
        record = records[i]
        if(record.lft !== record.rgt - 1){
          record.leaf = false
        }
      }


      if(withChildren){
        if(records && !Array.isArray(records)) records = [records]

        var ranges = []
        var rangeRecords = {}

        // loop over records and get it's ranges
        for(i = 0; i < records.length; i++){
          record = records[i]

          if(record.rgt - record.lft > 1){
            ranges.push([record.lft + 1, record.rgt - 1])
            rangeRecords[record.lft] = record
          }
        }

        if(ranges.length > 0){
          var depthConditions = null

          if(depth) depthConditions = {depth_lte: depth}

          // find all records within that ranges
          return this.model.where({lft_between: ranges}).where(depthConditions).order('lft').exec(function(children){
            for(var i = 0; i < children.length; i++){
              var child = children[i]

              // add all child records to the associated parents. based on lft and rgt
              if(rangeRecords[child.lft - 1]){
                var parent = rangeRecords[child.lft - 1]
                if(parent){
                  parent.children = parent.children || []
                  parent.children.push(child)
                  rangeRecords[child.lft] = child

                  delete rangeRecords[child.lft - 1]
                  rangeRecords[child.rgt] = parent
                }
              }
            }

            done()
          }).catch(done)
        }
      }

      done()
    })



    this.beforeCreate(function(record, transaction, done){
      if(record.parent_id){
        // search the parent node
        return self.model.find(record.parent_id).transaction(transaction).exec(function(parent){
          if(parent){
            return self.query().transacting(transaction).where('rgt', '>=', parent.rgt).increment('rgt', 2).then(function(){
              return self.query().transacting(transaction).where('lft', '>', parent.rgt).increment('lft', 2)
            }).then(function(){
              record.lft = parent.rgt // values before the update - see above
              record.rgt = parent.rgt + 1
              record.depth = parent.depth + 1
              done()
            })
          }
          done()
        })
      }else{
        // new root node!
        return self.model.rootOnly().order('rgt', true).limit(1).transaction(transaction).exec(function(rootSibling){
          if(rootSibling){
            record.lft = rootSibling.rgt + 1
            record.rgt = rootSibling.rgt + 2
          }else{
            record.lft = 1
            record.rgt = 2
          }
          record.depth = 0
          done()
        })
      }
    })


    // http://falsinsoft.blogspot.co.at/2013/01/tree-in-sql-database-nested-set-model.html

    this.beforeUpdate(function(record, transaction, done){
      if(record.hasChanged('parent_id')){
        if(record.parent_id){
          return self.model.find(record.parent_id).transaction(transaction).exec(function(parent){
            if(parent){
              record.__parent_rgt = parent.rgt // we need that in the afterUpdate
              record.__depth_diff = record.depth - parent.depth - 1 // we need that in the afterUpdate

              record.depth = parent.depth + 1 // only set the depth - the rest will be done by afterUpdate

              done()
            }else{
              done("can't find parent node with id " + record.parent_id)
            }
          })
        }else{
          // change to a root node
          return self.model.rootOnly().order('rgt', true).limit(1).transaction(transaction).exec(function(rootSibling){
            if(rootSibling){
              record.__parent_rgt = rootSibling.rgt + 1
            }else{
              record.__parent_rgt = record.rgt - record.lft
            }

            record.__depth_diff = record.depth
            record.depth = 0
            done()
          })
        }
      }
      done()
    })


    // TODO: move afterUpdate into beforeUpdate...
    // changes all nodes if a record got a new parent
    this.afterUpdate(function(record, transaction, done){
      if(record.hasChanged('parent_id')){
        var lft = record.lft
        var rgt = record.rgt
        var parentRgt = record.__parent_rgt
        var depthDiff = record.__depth_diff

        var raw = self.store.connection.raw

        if(record.__parent_rgt < lft){
          // move the records to the "left"
          self.query().transacting(transaction)
            .whereBetween('lft', [parentRgt, rgt]).orWhereBetween('rgt', [parentRgt, rgt])
            .update({
              'rgt': raw([
                'rgt + CASE WHEN',
                'rgt BETWEEN', lft, 'AND', rgt, // if it's the current record or one of it's children
                'THEN', (parentRgt - lft),
                'WHEN rgt BETWEEN', parentRgt, 'AND', lft - 1, // if it's a record between the old and the new location
                'THEN', (rgt - lft + 1),
                'ELSE 0 END'
              ].join(' ')),

              'lft': raw([
                'lft + CASE WHEN',
                'lft BETWEEN', lft, 'AND', rgt, // if it's the current record or one of it's children
                'THEN', (parentRgt - lft),
                'WHEN lft BETWEEN', parentRgt, 'AND', lft - 1, // if it's a record between the old and the new location
                'THEN', (rgt - lft + 1),
                'ELSE 0 END'
              ].join(' ')),

              'depth': raw([
                'CASE WHEN',
                'lft >', lft, 'AND rgt <', rgt, // if it's any of it's children
                'THEN depth - ', depthDiff,
                'ELSE depth END' // dont change the depth
              ].join(' '))
            })
            .then(function(a){
              done()
            })
        }else{
          // move the records to the "right"
          self.query().transacting(transaction)
            .whereBetween('lft', [lft, parentRgt]).orWhereBetween('rgt', [lft, parentRgt])
            .update({
              'rgt': raw([
                'rgt + CASE WHEN',
                'rgt BETWEEN', lft, 'AND', rgt, // if it's the current record or one of it's children
                'THEN', (parentRgt - rgt - 1),
                'WHEN rgt BETWEEN', rgt + 1, 'AND', parentRgt - 1, // if it's a record between the old and the new location
                'THEN', (lft - rgt - 1),
                'ELSE 0 END'
              ].join(' ')),

              'lft': raw([
                'lft + CASE WHEN',
                'lft BETWEEN', lft, 'AND', rgt, // if it's the current record or one of it's children
                'THEN', (parentRgt - rgt - 1),
                'WHEN lft BETWEEN', rgt + 1, 'AND', parentRgt - 1, // if it's a record between the old and the new location
                'THEN', (lft - rgt - 1),
                'ELSE 0 END'
              ].join(' ')),

              'depth': raw([
                'CASE WHEN',
                'lft >', lft, 'AND rgt <', rgt, // if it's any of it's children
                'THEN depth - ', depthDiff,
                'ELSE depth END' // dont change the depth
              ].join(' '))
            })
            .then(function(){
              done()
            })
        }
      }else{
        done()
      }
    })


    // handles the deletion of nodes!
    this.afterDestroy(function(record, transaction, done){
      var Model = this.model
      var raw = self.store.connection.raw

      var width = record.rgt - record.lft + 1

      Model.transaction(transaction).where({lft_between: [record.lft, record.rgt]}).delete().then(function(){
        return self.query().transacting(transaction).where('rgt', '>', record.rgt).update({rgt: raw('rgt - ' + width)})
      }).then(function(){
        return self.query().transacting(transaction).where('lft', '>', record.rgt).update({lft: raw('lft - ' + width)})
      }).then(function(){
        done()
      })
    })



    // Record methods

    this.instanceMethods.moveToChildOf = function(id){
      if(typeof id === 'object') id = id.id
      this.parent_id = id
    }
  }

}
