package main

import (
	"flag"
	"log"
	//"os/exec"

	"github.com/stardustapp/core/client"
	stargen "github.com/stardustapp/core/utils/stargen/common"
	"github.com/stardustapp/core/utils/stargen/platforms"
)

func main() {
	var starBase = flag.String("stardust-base", "http://localhost:9234/~~", "Stardust HTTP API root")
  var driverPath = flag.String("driver-path", "", "Path within Stardust to driver source")
  var compilePath = flag.String("compile-path", "/tmp/stargen", "Path within Stardust for temporary source files")
  var targetPath = flag.String("target-path", "/tmp/driver", "Path within Stardust for final build artifact (binary or archive)")
	flag.Parse()

  if *driverPath == "" {
    log.Println("--driver-path is required. Feed me a native driver path!")
    return
  }

  log.Println("Loaded", platforms.CountPlatforms(), "platforms")

  gen := stargen.Stargen{
    Orbiter: client.NewOrbiter(*starBase),
    DriverPath: *driverPath,
    CompilePath: *compilePath,
    TargetPath: *targetPath,
  }
  log.Println("Compiling", *driverPath, "to", *targetPath, "via", *compilePath)

  gen.DiscoverPlatform()
	gen.Platform.GenerateDriver()
	gen.Platform.CompileDriver()
}
