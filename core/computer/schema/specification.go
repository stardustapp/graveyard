package schema

type SchemaSpec struct {
	Origin    string
	Types     []*TypeSpec
	Functions []*FunctionSpec
}

// description of how to invoke blackbox behavior
type FunctionSpec struct {
	Name    string
	Runtime string
	Meeseek bool      // Meeseeks don’t usually have to exist [too] long
	Input   *TypeSpec // if it takes params, a struct goes here
	Output  *TypeSpec // if it returns stuff, a struct goes here
}

// recursive type, usually extended w/ fields
type TypeSpec struct {
	Name     string
	Optional bool `json:",omitempty"`

	// exactly one of these
	StringLiteral *string        `json:",omitempty" yaml:"string-literal"`
	TypePath      *string        `json:",omitempty" yaml:"type-path"`
	Extend        *ExtensionSpec `json:",omitempty"`
	Struct        []TypeSpec     `json:",omitempty"`
}

type ExtensionSpec struct {
	TypePath string `yaml:"type-path"`
	Params   []TypeSpec
}
