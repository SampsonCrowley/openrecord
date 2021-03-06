var Store = require('../../../lib/store')


describe('MySQL: all Attributes', function(){
  var store
  var database = 'all_attributes_test'



  before(function(next){
    beforeMYSQL(database, [
      'CREATE TABLE attribute_tests(char_attribute  varchar(255), float_attribute float, integer_attribute  integer, text_attribute text, boolean_attribute boolean, binary_attribute BLOB, date_attribute date, datetime_attribute datetime, time_attribute time)',
      "INSERT INTO attribute_tests VALUES('abcd', 2.3345, 3243, 'some text', true, 'some binary data', '2014-02-18', '2014-02-18 15:45:02', '15:45:01')"
    ], next)
  })

  before(function(){
    store = new Store({
      host: 'localhost',
      type: 'mysql',
      database: database,
      user: 'travis',
      password: ''
    })

    store.Model('AttributeTest', function(){})

    store.on('exception', function(){})
  })

  after(function(next){
    afterMYSQL(database, next)
  })




  it('have all attributes loaded', function(done){
    store.ready(function(){
      var AttributeTest = store.Model('AttributeTest')

      var attrs = AttributeTest.definition.attributes

      attrs.should.have.property('char_attribute')
      attrs.should.have.property('float_attribute')
      attrs.should.have.property('integer_attribute')
      attrs.should.have.property('text_attribute')
      attrs.should.have.property('boolean_attribute')
      attrs.should.have.property('binary_attribute')
      attrs.should.have.property('date_attribute')
      attrs.should.have.property('datetime_attribute')
      attrs.should.have.property('time_attribute')

      done()
    })
  })


  it('casts all values', function(done){
    store.ready(function(){
      var AttributeTest = store.Model('AttributeTest')
      AttributeTest.limit(1).exec(function(record){
        record.char_attribute.should.be.equal('abcd')
        record.float_attribute.should.be.equal(2.3345)
        record.integer_attribute.should.be.equal(3243)
        record.text_attribute.should.be.equal('some text')
        record.boolean_attribute.should.be.equal(true)
        record.date_attribute.toString().should.be.equal('2014-02-18')

        if(Buffer.from) record.binary_attribute.should.be.eql(Buffer.from('some binary data', 'utf-8'))
        else record.binary_attribute.should.be.eql(new Buffer('some binary data', 'utf-8')) // eslint-disable-line node/no-deprecated-api

        if(new Date().getTimezoneOffset() <= -60){ // my local test timezone
          record.datetime_attribute.toJSON().should.be.equal('2014-02-18T14:45:02.000Z')
        }else{ // travis-ci timezone
          record.datetime_attribute.toJSON().should.be.equal('2014-02-18T15:45:02.000Z')
        }

        record.time_attribute.toString().should.be.equal('15:45:01')
        done()
      })
    })
  })
})
