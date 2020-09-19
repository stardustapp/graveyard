package skylink

import (
	"log"
	"os"
	"os/signal"
	"runtime"
	"syscall"
)

func stackDumpOnSiqQuit() {
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGQUIT)
	buf := make([]byte, 1<<20)
	for {
		<-sigs
		stacklen := runtime.Stack(buf, true)
		log.Printf("skylink received SIGQUIT\n\n*** dumping goroutines due to SIGQUIT ***\n\n%s\n*** end ***\n\n", buf[:stacklen])
	}
}
