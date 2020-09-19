package toolbox

import (
	"errors"
	"log"
	"net"
	"os"
)

// Build cluster-wide absolute URI prefix to the current process
func SelfURI(suffix string) (string, error) {
	name, err := os.Hostname()
	if err != nil {
		log.Println("SelfURI Oops 1:", err)
		return "", errors.New("SelfURI couldn't discover the OS hostname")
	}

	addrs, err := net.LookupHost(name)
	if err != nil {
		log.Println("SelfURI Oops 2:", err)
		return "", errors.New("SelfURI couldn't resolve the OS hostname")
	}

	if len(addrs) < 1 {
		log.Println("SelfURI Oops 2:", err)
		return "", errors.New("SelfURI didn't locate any host IPs")
	}

	selfIp := addrs[0]
	return "skylink+ws://" + selfIp + suffix, nil
}
