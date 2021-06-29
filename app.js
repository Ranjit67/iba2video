//
const express = require("express");
const socket = require("socket.io");
var firebase = require("firebase");
const nodemailer = require("nodemailer");
const app = express();
app.use(express.json());
const http = require("http");
require("dotenv").config();
const server = http.createServer(app);

const io = socket(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");

  res.header(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers,X-Access-Token,XKey,Authorization"
  );

  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
    return res.status(200).json({});
  }
  next();
});
//cors end

//firebase end
const schedule = {};
const room = {};
const idToRoom = {};
const roomToId = {};
const mutedMentor = {};
const videoMute = {};
//student
const studentConnectedTo = {};
const studentIdToUuid = {};
const UuidToStudentId = {};
const recordRaw = {};
// const mentorStaticId = {};

//start
io.on("connection", (socket) => {
  socket.on("mentor start class", async (payload) => {
    console.log(payload);
    const { mentorId, scheduleID } = payload;
    // console.log(room[mentorId]);
    if (room?.[mentorId]?.length > 0 && schedule[mentorId] === scheduleID) {
      await room[mentorId].forEach((userUUid) => {
        const makeSoId = UuidToStudentId[userUUid];
        socket.emit("student want to connect", {
          studentId: makeSoId,
        });
      });
    } else {
      room[mentorId] = [];

      schedule[mentorId] = scheduleID;
      idToRoom[socket.id] = mentorId;
      roomToId[mentorId] = socket.id;
      mutedMentor[mentorId] = true;
      videoMute[mentorId] = true;
    }
  });
  // medil start
  socket.on("mentor refresh try", (payload) => {
    const { mentorUui } = payload;
    delete roomToId[mentorUui];
    roomToId[mentorUui] = socket.id;
    if (roomToId[mentorUui]) {
      // console.log("mentor id");
      delete idToRoom[roomToId[mentorUui]];
      idToRoom[socket.id] = mentorUui;

      socket.emit("already have", "data");
    }
  });

  socket.on("after refresh", (payload) => {
    const { roomRef } = payload;

    if (room[roomRef]) {
      room[roomRef].forEach((key) => {
        socket.emit("student want to connect", {
          studentId: UuidToStudentId[key],
        });
      });
    }
  });
  // join section2
  socket.on("student want to connect", async (payload) => {
    const { mentorUuid, studentUuid, scheduleID } = payload;

    if (UuidToStudentId[studentUuid]) {
      delete studentIdToUuid[UuidToStudentId[studentUuid]];
      studentIdToUuid[socket.id] = studentUuid;
      delete UuidToStudentId[studentUuid];
      UuidToStudentId[studentUuid] = socket.id;
      //change
      if (schedule[mentorUuid] == scheduleID) {
        const mentorSocketId = await roomToId?.[mentorUuid];
        io.to(mentorSocketId).emit("student want to connect", {
          studentId: socket.id,
        });
      } else {
        socket.emit("open dialog", "Class has ended....");
      }
    } else {
      if (roomToId[mentorUuid] && schedule[mentorUuid] == scheduleID) {
        UuidToStudentId[studentUuid] = socket.id;
        studentIdToUuid[socket.id] = studentUuid;

        room[mentorUuid].push(studentUuid);
        const mentiId = await roomToId?.[mentorUuid];
        io.to(mentiId).emit("student want to connect", {
          studentId: socket.id,
          studentUuid,
        });
      } else {
        if (roomToId[mentorUuid]) {
          //   socket.emit("open dialog", "Your mentor does not start class..");
          // } else {
          socket.emit("open dialog", "Your mentor busy with other class...");
        } else {
          // console.log(studentIdToUuid[socket.id]);
          socket.emit("open dialog", "Class has not started yet.");
        }
      }
    }
  });
  //signal send
  socket.on("sending signal", (payload) => {
    const { userToSignal, signal, uid } = payload;
    studentConnectedTo[studentIdToUuid[userToSignal]] = uid;
    io.to(userToSignal).emit("mentor send to student", {
      mentorFrontId: socket.id,
      mentorSignal: signal,
      muteStatus: mutedMentor[idToRoom[socket.id]],
      videoStatus: videoMute[idToRoom[socket.id]],
    });
  });
  socket.on("returning signal", (payload) => {
    const { signal, mentorFrontId } = payload;

    io.to(mentorFrontId).emit("student signal to mentor", {
      studentSignal: signal,
      id: socket.id,
    });
  });

  socket.on("video mute status", (payload) => {
    const { cameraStatus, mentorUuid } = payload;
    videoMute[mentorUuid] = cameraStatus;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("video signal", {
          cameraStatus,
        });
      });
    }
  });

  socket.on("mentor mute status", (payload) => {
    const { mute, mentorUuid } = payload;
    mutedMentor[mentorUuid] = mute;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("mute signal", {
          mute,
        });
      });
    }
  });

  //mute end
  socket.on("end meeting", (payload) => {
    const { mentorUUid } = payload;
    // room[mentorId] = [];
    delete idToRoom[socket.id];
    delete roomToId[mentorUUid];
    delete mutedMentor[mentorUUid];
    delete videoMute[mentorUUid];
    delete schedule[mentorUUid]; // for it host leave card not display

    if (room[mentorUUid]) {
      room[mentorUUid].forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "connected host leave",
          "data"
        );
        // delete studentIdToUuid[UuidToStudentId[studentUuid]];
        // delete UuidToStudentId[studentUuid];
      });
      delete room[mentorUUid];
    }
    // socket.emit("mentor want to upload video", recordRaw[mentorUUid]);
  });
  socket.on("Student exit himself", (payload) => {
    const { studentUid } = payload;
    if (UuidToStudentId[studentUid]) {
      delete studentIdToUuid[UuidToStudentId[studentUid]];
      delete UuidToStudentId[studentUid];
    }
  });
  socket.on("host take leave it clint side action", (payload) => {
    const { studentUuid } = payload;
    delete studentIdToUuid[socket.id];
    delete UuidToStudentId[studentUuid];
  });
  socket.on("student leave the meeting", (payload) => {
    const { studentId, mentorUuid, tempMessage } = payload;
    if (room[mentorUuid]) {
      const afterLeave = room[mentorUuid].filter((user) => user !== studentId);
      room[mentorUuid] = afterLeave;
      const mentorSocketId = roomToId[mentorUuid];
      io.to(mentorSocketId).emit("one student leave", {
        studentIdUuid: studentId,
        tempMessage,
      });
      delete studentIdToUuid[socket.id];
      delete UuidToStudentId[studentId];
    }
  });
  //message
  socket.on("send message to student", (payload) => {
    const { tempMessage } = payload; //uuid, message
    if (room[tempMessage.uuid].length >= 1) {
      room[tempMessage.uuid].forEach((studentUuid) => {
        if (UuidToStudentId[studentUuid]) {
          io.to(UuidToStudentId[studentUuid]).emit("message receive", {
            tempMessage,
          });
        }
      });
    }
  });
  socket.on("send message to all", (payload) => {
    const { tempMessage, mentorUuid } = payload;

    if (room[mentorUuid]) {
      io.to(roomToId[mentorUuid]).emit("one of the student send message", {
        tempMessage,
      });
    }
  });
  socket.on("send to other", (payload) => {
    const { tempMessage, mentorUuid } = payload;
    if (room[mentorUuid].length > 1) {
      const exceptSender = room[mentorUuid].filter(
        (studentUuid) => studentUuid !== tempMessage.uuid
      );
      exceptSender.forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "all student get other student data",
          { tempMessage }
        );
      });
    }
  });
  //message end
  //record video start

  socket.on("record start", (payload) => {
    socket.emit("record", "data");
  });
  socket.on("stop record", (payload) => {
    socket.emit("record stop", "data");
  });
  //recording raw data
  socket.on("recording raw data", (payload) => {
    const { record, mentor } = payload;
    if (recordRaw[mentor]) {
      recordRaw[mentor] = [...recordRaw[mentor], record];
    } else {
      recordRaw[mentor] = [record];
    }
    // console.log(mentor);
  });
  socket.on("save in cloud", (payload) => {
    const { mentorUid } = payload;
    //storage
    // console.log(recordRaw[mentorUid]);
  });
  //end Video

  //disconnect part
  socket.on("disconnect", () => {
    if (room[idToRoom[socket.id]]) {
      const mentorUid = idToRoom?.[socket.id];
      const roomTempData = room[mentorUid];
      //clear data from var
      // delete idToRoom[socket.id];
      // if i comment out then refresh will work
      // delete room[mentorUid];
      // delete roomToId[mentorUid];
      // delete mutedMentor[mentorUid];
      // delete videoMute[mentorUid];
      //may be it create issues
      roomTempData.forEach((user) => {
        const studentSocketId = UuidToStudentId?.[user];
        io.to(studentSocketId).emit("connected host leave", "data");
      });
      socket.broadcast.emit("send class already exit", {
        roomToId,
      });
    } else if (studentIdToUuid[socket.id]) {
      const studentIdUuid = studentIdToUuid[socket.id];
      const mentorUuid = studentConnectedTo[studentIdUuid];

      if (room[mentorUuid]) {
        const haveIn = room[mentorUuid].filter((id) => id !== studentIdUuid);
        room[mentorUuid] = haveIn;
      }
      delete UuidToStudentId[studentIdUuid];
      delete studentIdToUuid[socket.id];
      delete studentConnectedTo[studentIdUuid];
      io.to(roomToId[mentorUuid]).emit("one student leave", { studentIdUuid });
    }
  });
});

//live stream 2

//update one stream var
const stream2Mentor = {};
const userSoIdToUidStream2 = {};
const userConnectedTo = {};
const mentorSoIdToUid = {};

io.of("/stream").on("connection", (socket) => {
  // try {
  //user first time join
  socket.on("joining request send", (payload) => {
    try {
      const { mentorId, userId } = payload;

      if (stream2Mentor[mentorId]) {
        userSoIdToUidStream2[socket.id] = userId;
        userConnectedTo[userId] = mentorId;
        const fillTarDta = stream2Mentor?.[mentorId]?.filter(
          (id) => id?.uid !== userId
        );

        fillTarDta?.push({
          type: "user",
          uid: userId,
          soId: socket.id,
        });

        stream2Mentor[mentorId] = fillTarDta;
        const findMentor = stream2Mentor?.[mentorId]?.find(
          (id) => id.type === "mentor"
        );

        socket.to(findMentor?.soId).emit("send for create peer", {
          userUid: userId,
          mentorShareScreen: findMentor?.screenShare,
        });
      } else {
        socket.emit("mentor_does_not_start_the_class");
      }
    } catch (error) {
      new Error(error);
    }
  });

  //mentor first time join
  socket.on("Mentor join", (payload) => {
    try {
      const { mentorId } = payload;
      mentorSoIdToUid[socket.id] = mentorId;
      stream2Mentor[mentorId] = [];
      stream2Mentor[mentorId]?.push({
        type: "mentor",
        audio: true,
        video: true,
        screenShare: false,
        soId: socket.id,
        uid: mentorId,
      });
    } catch (error) {
      new Error(error);
    }
  });

  socket.on("disconnect", () => {
    //user disconnect
    try {
      if (userSoIdToUidStream2[socket.id]) {
        const userUid = userSoIdToUidStream2?.[socket.id];
        const connectedToMentorUid = userConnectedTo[userUid];
        const mentorData = stream2Mentor?.[connectedToMentorUid]?.find(
          (id) => id?.type === "mentor"
        );
        socket.to(mentorData?.soId).emit("one user leave", {
          userUid: userUid,
        });
        // stream2Mentor[connectedToMentorUid] = stream2Mentor?.[
        //   connectedToMentorUid
        // ]?.filter((id) => id.uid !== userUid);
        // console.log(userConnectedTo[userUid]);
        const leftUser = await stream2Mentor?.[connectedToMentorUid]?.filter(
          (id) => id.uid !== userUid
        );
        if (leftUser?.length > 0) {
          stream2Mentor[connectedToMentorUid] = leftUser;
        }


        delete userConnectedTo[userUid];
        delete userSoIdToUidStream2[socket.id];
      } else if (mentorSoIdToUid[socket.id]) {
        const mentorUid = mentorSoIdToUid?.[socket.id];

        const filterMentor = stream2Mentor?.[mentorUid]?.filter(
          (id) => id.type !== "mentor"
        );
        filterMentor?.forEach((id) => {
          socket.to(id?.soId).emit("mentor take leave");
        });
        delete stream2Mentor[mentorUid];
        delete mentorSoIdToUid[socket.id];
      }
    } catch (error) {
      new Error(error);
    }
  });

  //signal exchange start from mentor

  socket.on("Mentor send signal", async (payload) => {
    try {
      const { sendTo, mentorUid, signalData, startDate } = payload;
      const findUser = stream2Mentor?.[mentorUid]?.find(
        (id) => id.uid === sendTo
      );
      const findMentor = await stream2Mentor?.[mentorUid]?.find(
        (id) => id.type === "mentor"
      );

      socket.to(findUser?.soId).emit("send to user", {
        mentorSignal: signalData,
        mentorMic: findMentor.audio,
        mentorVideo: findMentor.video,
        startDate,
      });
    } catch (error) {
      new Error(error);
    }
  });

  socket.on("User send signal to mentor", (payload) => {
    try {
      const { signal, mentorUid, userUid } = payload;
      const findMentorData = stream2Mentor?.[mentorUid]?.find(
        (id) => id.uid === mentorUid
      );
      socket.to(findMentorData?.soId).emit("mentor get return signal", {
        userSignal: signal,
        user: userUid,
        soId: socket.id,
      });
    } catch (error) {
      new Error(error);
    }
  });
  socket.on("make_true", (payload) => {
    const { userSoId } = payload;
    socket.to(userSoId).emit("make_true_loader");
  });
  socket.on("user_delete_himself", (payload) => {
    try {
      const userUid = userSoIdToUidStream2?.[socket.id];
      delete userConnectedTo[userUid];
      delete userSoIdToUidStream2?.[socket.id];
    } catch (error) {
      new Error(error);
    }
  });

  //mentor leave
  socket.on("mentor leave the class", (payload) => {
    try {
      // const { mentorUid } = payload;

      const mentorUid = mentorSoIdToUid?.[socket.id];
      const filterMentor = stream2Mentor?.[mentorUid]?.filter(
        (id) => id.type !== "mentor"
      );
      filterMentor?.forEach((id) => {
        socket.to(id?.soId).emit("mentor take leave");
      });
      delete stream2Mentor[mentorUid];
      delete mentorSoIdToUid[socket.id];
    } catch (error) {
      new Error(error);
    }
  });
  // mentor mute status
  socket.on("mentor_video_mute", async (payload) => {
    try {
      const { videoMuteStatus, mentorUid } = payload;
      const filterMentor = await stream2Mentor?.[mentorUid]?.filter(
        (id) => id.type !== "mentor"
      );
      const findMentor = await stream2Mentor?.[mentorUid]?.find(
        (id) => id.type === "mentor"
      );
      await filterMentor?.forEach((id) => {
        socket.to(id.soId).emit("video_status_send_user", { videoMuteStatus });
      });
      await filterMentor?.push({
        type: "mentor",
        audio: findMentor?.audio,
        video: !videoMuteStatus,
        screenShare: findMentor?.screenShare,
        soId: socket.id,
        uid: mentorUid,
      });
      stream2Mentor[mentorUid] = filterMentor;
    } catch (error) {
      new Error(error);
    }
  });
  socket.on("mentor_mute_mic", async (payload) => {
    try {
      const { micStatus, mentorUid } = payload;

      const filterMentor = await stream2Mentor?.[mentorUid]?.filter(
        (id) => id.type !== "mentor"
      );
      const findMentor = await stream2Mentor?.[mentorUid]?.find(
        (id) => id.type === "mentor"
      );
      await filterMentor?.forEach((id) => {
        socket.to(id.soId).emit("mic_status_send_user", { micStatus });
      });
      await filterMentor?.push({
        type: "mentor",
        audio: !micStatus,
        video: findMentor?.video,
        screenShare: findMentor?.screenShare,
        soId: socket.id,
        uid: mentorUid,
      });
      stream2Mentor[mentorUid] = filterMentor;
    } catch (error) {
      new Error(error);
    }
  });
  socket.on("rotate_signal", (payload) => {
    const { userSignal, user } = payload;
    socket.emit("mentor get return signal", {
      userSignal,
      user,
    });
  });
  //user leave
  socket.on("User leave", async (payload) => {
    try {
      const userUid = userSoIdToUidStream2?.[socket.id];
      const connectedToMentorUid = userConnectedTo[userUid];
      const mentorData = await stream2Mentor?.[connectedToMentorUid]?.find(
        (id) => id?.type === "mentor"
      );
      socket.to(mentorData?.soId).emit("one user leave", {
        userUid: userUid,
      });

      const leftUser = await stream2Mentor?.[connectedToMentorUid]?.filter(
        (id) => id.uid !== userUid
      );
      if (leftUser?.length > 0) {
        stream2Mentor[connectedToMentorUid] = leftUser;
      }

      delete userConnectedTo[userUid];
      delete userSoIdToUidStream2[socket.id];
    } catch (error) {
      new Error(error);
    }
  });

  // messaging center

  socket.on("message_Sand", async (payload) => {
    try {
      const {
        message,
        userSelf,
        mentorUid,
        senderName,
        textUid,
        imageFile,
        reaction,
        record,
      } = payload;

      const userHimself = await stream2Mentor?.[mentorUid]?.filter(
        (id) => id?.uid !== userSelf
      );

      await userHimself?.forEach((element) => {
        socket.to(element?.soId).emit("message_receive", {
          message,
          userSelf,
          senderName,

          textUid,
          imageFile,
          reaction,
          record,
        });
      });
    } catch (error) {
      new Error(error);
    }
  });
  //typing
  socket.on("text_typing", (payload) => {
    const { name, textStatus, mentorUid, userSelf } = payload;
    const userHimself = stream2Mentor?.[mentorUid]?.filter(
      (id) => id?.uid !== userSelf
    );
    userHimself?.forEach((element) => {
      socket.to(element?.soId).emit("Typing_some_One", {
        name,
        textStatus,
      });
    });
  });
});

//for mail route
app.get("/data", async (req, res, next) => {
  try {
    res.json({ data: "data save suc" });
  } catch (error) {
    next(error);
  }
});
// checkout
app.post("/mail", async (req, res, next) => {
  try {
    const { displayFromSideName, toEmail, body, subject, cc, bcc } = req.body;

    if (toEmail.length < 1)
      throw createError.BadRequest("You have to enter sender email... ");
    //mail property
    let transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "noreply.itqanuae@gmail.com",
        pass: "itqan@2021",
      },
    });
    //mail option
    const mailOption = {
      from: `${displayFromSideName} <foo@example.com>`,
      to: toEmail,
      subject: subject,
      text: body,
      cc,
      bcc,
    };
    const send = await transport.sendMail(mailOption);
    //mail option end
    //mail end
    res.send({ data: send });
  } catch (error) {
    console.log(error);
  }
});
//check

//mail route

//register route
// app.post("/register");

//register rote end
//error handel
app.use(async (req, res, next) => {
  next(createError.NotFound());
});

app.use((err, req, res, next) => {
  res.status(err.status || 400);
  res.send({
    error: {
      status: err.status || 400,
      message: err.message,
    },
  });
});

server.listen(process.env.PORT || 4000, () => {
  console.log("The port 4000 is ready to start....");
});
//end
