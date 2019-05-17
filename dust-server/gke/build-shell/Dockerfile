FROM docker:dind
WORKDIR /root
RUN apk add python2 git bash vim
RUN wget https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-246.0.0-linux-x86_64.tar.gz && \
    tar -xf google-cloud-sdk-246.0.0-linux-x86_64.tar.gz && \
    ./google-cloud-sdk/install.sh
ENV PATH="/root/google-cloud-sdk/bin:${PATH}"
RUN ./google-cloud-sdk/bin/gcloud init && \
    gcloud auth configure-docker && \
    gcloud components install kubectl
