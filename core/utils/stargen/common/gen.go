package common

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/toolbox"
)

type Stargen struct {
	Orbiter     *toolbox.Orbiter
	DriverCtx   base.Context
	CompileCtx  base.Context
	CompilePath string
	TargetPath  string
	Platform    Platform
}

func (gen *Stargen) DiscoverPlatform() bool {
	platformStr, ok := gen.DriverCtx.GetString("/platform")
	if !ok {
		panic("Driver at " + gen.DriverCtx.Name() + " is lacking a platform")
	}
	platformName := platformStr.Get()

	log.Println("Platform is", platformName)
	if platform, ok := Platforms[platformName]; ok {
		gen.Platform = platform(gen)
		return true
	} else {
		panic("Missing platform " + platformName)
	}
}
