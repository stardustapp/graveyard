package common

import (
  "log"

	"github.com/stardustapp/core/client"
)

type Stargen struct {
  Orbiter *client.Orbiter
  DriverPath string
  CompilePath string
  TargetPath string
  Platform Platform
}

func (gen *Stargen) DiscoverPlatform() bool {
  platformName, err := gen.Orbiter.ReadString(gen.DriverPath + "/platform")
  if err != nil {
    log.Println(err)
    panic("Driver at " + gen.DriverPath + " is lacking a platform")
  }

  log.Println("Platform is", platformName)
  if platform, ok := Platforms[platformName]; ok {
    gen.Platform = platform(gen)
    return true
  } else {
    panic("Missing platform " + platformName)
  }
}
