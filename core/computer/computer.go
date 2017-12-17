package computer

import (
	//"fmt"
	"log"
	//"encoding/json"

	"github.com/stardustapp/core/computer/schema"
)

type Computer struct {
	drive *BoltDrive
}

func Run() (*Computer, error) {
	log.Println("starting to run computer")

	/*
	  coreDrive, err := openBoltDrive("drive-root.db")
		if err != nil {
			panic(err)
		}
	*/
	var coreDrive Drive = newMemoryDrive()
	log.Println("drive", coreDrive) //, "err", err)
	defer coreDrive.Close()

	specSpec, err := schema.FromSpecFile("core-schemas/specs.yaml")
	if err != nil {
		panic(err)
	}

	//log.Print("Canonical Spec:\n" + spec.AsCanon(true))
	hash := specSpec.HashCode()
	log.Printf("Specification hash is %016x", hash)
	//specSpec.Encode()

	//typeSchema := coreDrive.InstallSpec("types", typeSpec)
	coreDrive.InstallSpec("specs", specSpec)

	/*
	   buf, err := json.Marshal(specSpec)
	   if err != nil {
	     panic(err)
	   }
	*/
	/*err = coreDrive.WriteKey("manifests", fmt.Sprintf("%016x"), buf)
		if err != nil {
	    panic(err)
	  }*/

	log.Println("done running computer ??")
	return nil, nil
}
