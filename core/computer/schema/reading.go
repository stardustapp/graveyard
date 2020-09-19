package schema

import (
	"io/ioutil"

	"gopkg.in/yaml.v2"
)

func FromSpecFile(path string) (*SchemaSpec, error) {
	raw, err := ioutil.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return FromSpecYaml(raw, "file://"+path)
}

func FromSpecYaml(serialized []byte, origin string) (*SchemaSpec, error) {
	spec := &SchemaSpec{
		Origin: origin,
	}

	if err := yaml.Unmarshal(serialized, spec); err != nil {
		return spec, err
	}
	return spec, nil
}
