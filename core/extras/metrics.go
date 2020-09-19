package extras

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

	metric.Namespace = ""
	metric.Tags = append(metric.Tags, "binary:"+os.Args[0], "domain:devmode.cloud")
}

func MetricIncr(name string, tags ...string) error {
	return metric.Incr(name, tags, 1)
}

func MetricDecr(name string, tags ...string) error {
	return metric.Decr(name, tags, 1)
}

func MetricCount(name string, value int64, tags ...string) error {
	return metric.Count(name, value, tags, 1)
}

func MetricGauge(name string, value float64, tags ...string) error {
	return metric.Gauge(name, value, tags, 1)
}
