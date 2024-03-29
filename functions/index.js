const functions = require('firebase-functions');

// The Firebase Admin SDK to access Cloud Firestore.
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore()


const express = require('express');
const app = express();
app.set('view engine', 'pug');
app.set('views', './views');

const result = require("./result.js");
const { query } = require('express');

const MAX_SEED = 1000

app.get('/', (req, res) => {
    res.render("home");
});

app.use("/result", result, (req, res, next) => {
    console.log(req.query)
    next();
})

app.get("/results", result, (req, res) => {
    try {
        const quantity = parseInt(req.query.quantity)
        const difficulty = req.query.difficulty
        let picks;
        if (quantity === undefined | !Number.isInteger(parseInt(quantity))) {
            picks = 1
            console.log("Query 'quantity' is not a number. Setting picks to 1");
        } else {
            picks = parseInt(quantity)
        }
        return db.collection("Exercises").get()
            .then(querySnapshot => {
                const numDocuments = querySnapshot.docs.length
                if (numDocuments === 0 | numDocuments < picks) {
                    return res.status(200).render("none-found", {
                        title: "No exercises available",
                        message: "Try adding other exercises"
                    })
                } else if (numDocuments === picks) {
                    console.log("Sending ordered list")
                    // Returns array
                    return res.status(200).render("result", {
                        exercises: querySnapshot.docs.map(doc => doc.data()),
                        level: difficulty
                    })
                } else {
                    // Desired branch. Number of picks is < the number of elements to pick from.
                    const subCollectionArray = customFisherYates(querySnapshot.docs, picks).map(document => document.data())
                    // Returns array
                    return res.status(200).render("result", {
                        exercises: subCollectionArray,
                        level: difficulty
                    })

                }
            }).catch(reason => {
                console.error(reason)
                return res.status(500).send("Error getting document")
            })
    } catch (error) {
        console.log(error)
        return res.status(404)
    }


})

app.get("/add-exercise", (req, res) => {
    try {
        res.render("form", {
            message: "",
            params: {
                Name: "", Easy: "", Medium: "", Hard: ""
            }
        })
    } catch (error) {
        console.log(error)
        res.status(404)
    }
})

app.post("/add-exercise", async (req, res) => {
    try {
        // Validation logic
        let message = "";
        if (req.body.Name === "" | req.body.Hard === "" | req.body.Medium === "" | req.body.Easy === "") {
            console.log("Invalid form")
            return res.status(200).render("form", {
                message: "Fill in empty sections",
                params: req.body
            })
        } else {
            const exercise = req.body;
            exercise.random = Math.random() * MAX_SEED
            const writeResult = await db.collection('Exercises').add(exercise);
            console.log(`Message with ID: ${writeResult.id} added.`)
            return res.status(200).render("form", {
                message: "Successfully submitted",
                params: {
                    Name: "", Easy: "", Medium: "", Hard: ""
                }
            })
        }
    } catch (error) {
        console.log(error)
        return res.status(404)
    }
})

// Have to use app becuase firebase won't render the pug templates
app.get("/all-exercises", async (req, res) => {
    try {
        return db.collection("Exercises").get().then(querySnapshot => {
            if (querySnapshot.empty) return res.status(200).send({ message: "No content to return" })
            else return res.status(200).render("result-all", {
                exercises: querySnapshot.docs.map(doc => doc.data())
            })
        }).catch(reason => {
            console.error(reason)
            return res.status(500).render("none-found", {
                title: "No exercises available",
                message: "Try adding other exercises"
            })
        })
    } catch (error) {
        console.log(error)
        return res.status(404)
    }
})

exports.home = functions.https.onRequest(app)

/* 
curl -X POST -d "Name=Press%20up&Easy=5&Medium=10&Hard=20" http://localhost:5001/days-web/us-central1/addExercise
curl -X POST -d "Name=Squat&Easy=20&Medium=40&Hard=60" http://localhost:5001/days-web/us-central1/addExercise
curl -X POST -d "Name=Sit%20up&Easy=10&Medium=20&Hard=30" http://localhost:5001/days-web/us-central1/addExercise
curl -X POST -d "Name=Crunch&Easy=10&Medium=20&Hard=30" http://localhost:5001/days-web/us-central1/addExercise
 */

//  Sample post request to add an exercise
exports.addExercise = functions.https.onRequest(async (req, res) => {
    // Grab the text parameter.
    const exercise = req.body;
    exercise.random = Math.random() * MAX_SEED
    console.log("Attempting to add exercise")
    console.log(req.body)
    // Push the new message into Cloud Firestore using the Firebase Admin SDK.
    const writeResult = await db.collection('Exercises').add(exercise);
    // Send back a message that we've succesfully written the message
    res.status(200).json({ result: `Message with ID: ${writeResult.id} added.` });
});

exports.getAllExcercise = functions.https.onRequest(async (req, res) => {
    try {
        return db.collection("Exercises").get().then(querySnapshot => {
            if (querySnapshot.empty) return res.status(200).send({ message: "No content to return" })
            else return res.status(200).render("result", {
                exercises: querySnapshot.docs.map(doc => doc.data())
            })
        }).catch(reason => {
            console.error(reason)
            return res.status(500).send("Error getting document")
        })
    } catch (error) {
        console.log(error)
        return res.status(404)
    }
})

// Case matters here
exports.getExcercise = functions.https.onRequest((req, res) => {
    // Query for exercise by name and return JSON
    const name = req.query.name
    if (name === undefined) {
        // Handles no exercise provided with correct query
        res.status(404).send("Incorrect query provided")
    } else {
        db.collection("Exercises").where("Name", "==", name)
            .get()
            .then(querySnapshot => {
                if (querySnapshot.empty) return res.status(200).send("No matching exercise found")
                else return res.status(200).send(querySnapshot.docs.map(doc => doc.data())[0])
            })
            .catch(error => {
                console.log("Error getting documents: ", error);
                return res.status(500).send("Error getting documents")
            });
    }
})

// https://stackoverflow.com/questions/46798981/firestore-how-to-get-random-documents-in-a-collection
exports.getRandomExcercise = functions.https.onRequest((req, res) => {
    // Get random exercise
    db.collection("Exercises").get().then(querySnapshot => {
        const documentArray = querySnapshot.docs
        if (querySnapshot.empty) {
            return res.status(200).send("No exercises found")
        } else {
            // Desired branch. Select 1 random element.
            // I have assumed that a number may be shuffled into it's original position
            const subCollectionArray = customFisherYates(documentArray, 1).map(document => document.data())
            // JSON return type
            return res.status(200).json(subCollectionArray[0])
        }
    }).catch(reason => {
        console.error(reason)
        return res.status(500).send("Error getting document")
    })
})

// Get random exercise
exports.getRandomExcercises = functions.https.onRequest((req, res) => {
    const quantity = parseInt(req.query.quantity)
    let picks;
    if (quantity === undefined | !Number.isInteger(parseInt(quantity))) {
        picks = 1
        console.log("Query 'quantity' is not a number. Setting picks to 1");
    } else {
        picks = parseInt(quantity)
    }
    db.collection("Exercises").get()
        .then(querySnapshot => {
            const numDocuments = querySnapshot.docs.length
            if (numDocuments === 0 | numDocuments < picks) {
                return res.status(200).send("Query not continued. Number of items in db", numDocuments, "and number of picks", picks)
            } else if (numDocuments === picks) {
                console.log("Sending ordered list")
                // Returns array
                return res.status(200).send(querySnapshot.docs.map(document => document.data()))
            } else {
                // Desired branch. Number of picks is < the number of elements to pick from.
                const subCollectionArray = customFisherYates(querySnapshot.docs, picks).map(document => document.data())
                // Returns array
                return res.status(200).send(subCollectionArray)

            }
        }).catch(reason => {
            console.error(reason)
            return res.status(500).send("Error getting document")
        })


})



/* 
curl -X POST -d "Name=Press%20up&Easy=5&Medium=10&Hard=20" http://localhost:5001/days-web/us-central1/updateExcercise?name=Press%20up
curl -X POST -d "Name=Sit%20up&Easy=1000&Medium=100&Hard=100" http://localhost:5001/days-web/us-central1/updateExcercise?name=Sit%20up
curl -X POST -d "Name=Squat&Easy=20&Medium=40&Hard=60" http://localhost:5001/days-web/us-central1/updateExcercise?name=
curl -X POST -d "Name=Crunch&Easy=10&Medium=20&Hard=30" http://localhost:5001/days-web/us-central1/updateExcercise?name=Crunch
 */
exports.updateExcercise = functions.https.onRequest((req, res) => {
    // Patch request?
    const name = req.query.name;
    console.log(name)
    if (name === undefined) {
        return res.status(200).send("Bad query")
    } else {
        db.collection("Exercises").where("Name", "==", name).get().then(querySnapshot => {
            if (querySnapshot.empty) {
                return res.status(200).send("No document found")
            } else {
                const document = querySnapshot.docs[0]
                const settings = Object.assign({}, document.data())
                if (req.body.Easy !== undefined) settings.Easy = req.body.Easy
                if (req.body.Medium !== undefined) settings.Medium = req.body.Medium
                if (req.body.Hard !== undefined) settings.Hard = req.body.Hard
                if (req.body.Name !== undefined) settings.Name = req.body.Name
                db.collection("Exercises").doc(document.id).update(settings)
                // Updated document (Object)
                return res.status(200).json(settings)
            }
        }).catch(reason => {
            console.error(reason)
            return res.status(500).send("Not sure how to handle this")
        })
    }

})

// Probably works
function customFisherYates(documentArray, picks) {
    const pickArray = []
    for (i = documentArray.length - 1; i > documentArray.length - 1 - picks; i--) {
        const rand = Math.floor(Math.random() * i);
        const hold = documentArray[i]
        pickArray.push(documentArray[rand])
        documentArray[i] = documentArray[rand]
        documentArray[rand] = hold
    }
    return documentArray.slice(-1 * picks)
}