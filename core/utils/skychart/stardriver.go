package main

import (
	"fmt"
	"log"
	"os"
	"path"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

var myKubeApi *kubeApi

func resolveStarDriver(name string) (deviceUri string) {
	if myKubeApi == nil {
		myKubeApi = openKube(os.Getenv("KUBECONFIG_PATH"))
	}

	svcName := "stardriver-" + path.Base(name)
	return myKubeApi.getService(svcName)
}

func openKube(configPath string) *kubeApi {
	// uses the current context in kubeconfig
	var config *rest.Config
	var err error
	if configPath == "" {
		config, err = rest.InClusterConfig()
	} else {
		config, err = clientcmd.BuildConfigFromFlags("", configPath)
	}
	if err != nil {
		log.Println(err)
		return nil
	}

	// creates the clientset
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Println(err)
		return nil
	}

	return &kubeApi{
		svc: clientset,
	}
}

// Presents APIs to inspect and provision against a Kubernetes cluster
type kubeApi struct {
	//config *rest.Config
	svc *kubernetes.Clientset
}

// jobs will create unlimited pods if the failure keeps happening
// do we even want jobs then?
func (e *kubeApi) getService(name string) string {
	services := e.svc.CoreV1().Services("default")

	svc, err := services.Get(name, metav1.GetOptions{})
	if err != nil {
		log.Fatalln("K8S Service fetching failed:", err)
	}

	return fmt.Sprintf("apt:%d", svc.Spec.Ports[0].NodePort)
}
