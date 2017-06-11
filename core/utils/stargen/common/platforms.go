package common

type Platform interface {
  GenerateDriver() error
  CompileDriver() error
}

var Platforms map[string]func(gen *Stargen) Platform
func init() {
  Platforms = make(map[string]func(gen *Stargen) Platform)
}
