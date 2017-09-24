package skylink

import (
	"log"
	"os"

	"github.com/DataDog/datadog-go/statsd"
)

var metric *statsd.Client

func init() {
	var err error
	metric, err = statsd.New("dogstatsd:8125")
	if err != nil {
		metric, err = statsd.New("localhost:8125")
		if err != nil {
			log.Println("Failed to set up dogstatsd reporting")
			log.Fatal(err)
		} else {
			log.Println("set up dogstatsd for local use")
		}
	} else {
		log.Println("set up dogstatsd for kubernetes")
	}

	metric.Namespace = "skylink."
	metric.Tags = append(metric.Tags, "binary:"+os.Args[0])
}
