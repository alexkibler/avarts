/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  collection.schema.addField(new SchemaField({
    "system": false,
    "name": "unit_preference",
    "type": "select",
    "required": false,
    "options": {
      "maxSelect": 1,
      "values": ["metric", "imperial"]
    }
  }));

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  collection.schema.removeField("unit_preference");

  return dao.saveCollection(collection);
});
