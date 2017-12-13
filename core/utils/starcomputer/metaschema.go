package main

import (
  "log"
  //"hash"
  //"hash/fnv"
  "encoding/json"

  "gopkg.in/yaml.v2"
)

func ReadYamlSchema(serialized []byte) (*RawSchema, error) {
  var schema RawSchema
  if err := yaml.Unmarshal(serialized, &schema); err != nil {
    log.Println("couldn't deserialize:", err)
    return nil, err
  }

  log.Printf("deserialized %+v", schema)

  res2B, _ := json.Marshal(schema)
  log.Println(string(res2B))

  return &schema, nil
}

type RawSchema struct {
      Types []*RawType
}

// recursive type, usually extended w/ fields
type RawType struct {
  Name string
  BasePath string // absolute to core, or relative to package, or local to params
  Params []RawField
  ParamDefs []RawField `yaml:"param-defs"`
  Fields []RawField
}

/*type RawField struct {
  Name string
  Optional bool
  Type RawType
}*/

type RawField struct {
  Name string
  Optional bool
  Type *RawType
  TypePath string
  //Paths []string
  Literal *string // literal / default
}


//func (r *RawSchema) HashCode() string {
//  hasher := fnv.New64()
//}
